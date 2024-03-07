import { SQL_PREFIX, SQL_SUFFIX } from "@/lib/prompt";
import { OpenAI } from "langchain";
import { SqlToolkit, createSqlAgent } from "langchain/agents";
import { SqlDatabase } from "langchain/sql_db";
import type { NextApiRequest, NextApiResponse } from "next";
import { DataSource } from "typeorm";

export const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Δημιουργία του DataSource για MariaDB/MySQL
  const datasource = new DataSource({
    type: "mysql", // Εδώ ρυθμίζουμε τον τύπο της βάσης δεδομένων σε mysql
    host: process.env.DATABASE_URL.split('@')[1].split('/')[0], // Χρησιμοποιεί τον host από το DATABASE_URL
    port: 3306, // Βεβαιωθείτε ότι η πόρτα είναι η σωστή για την MariaDB/MySQL σας
    username: process.env.DATABASE_URL.split('//')[1].split(':')[0], // Χρησιμοποιεί το username από το DATABASE_URL
    password: process.env.DATABASE_URL.split(':')[2].split('@')[0], // Χρησιμοποιεί τον κωδικό από το DATABASE_URL
    database: process.env.DATABASE_URL.split('/')[1], // Χρησιμοποιεί το όνομα της βάσης δεδομένων από το DATABASE_URL
  });

  await datasource.initialize();

  const db = await SqlDatabase.fromDataSource(datasource);

  const toolkit = new SqlToolkit(db);
  const model = new OpenAI({ openAIApiKey: process.env.OPENAI_API_KEY, temperature: 0 });
  const executor = createSqlAgent(model, toolkit, { topK: 10, prefix: SQL_PREFIX, suffix: SQL_SUFFIX });
  const { query: prompt } = req.body;

  console.log("Prompt : " + prompt);

  let response = {
    prompt: prompt,
    sqlQuery: "",
    result: [],
    error: ""
  };

  try {
    const result = await executor.call({ input: prompt });

    result.intermediateSteps.forEach((step: any) => {
      if (step.action.tool === "query-sql") {
        response.prompt = prompt;
        response.sqlQuery = step.action.toolInput;
        response.result = JSON.parse(step.observation);
      }
    });

    console.log(`Intermediate steps ${JSON.stringify(result.intermediateSteps, null, 2)}`);
  } catch (e: any) {
    console.log(e);
    response.error = "Server error. Try again with a different prompt.";
    res.status(200).json(response);
  }

  await datasource.destroy();
  res.status(200).json(response);
};

export default handler;
