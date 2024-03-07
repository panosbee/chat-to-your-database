import { SQL_PREFIX, SQL_SUFFIX } from "@/lib/prompt";
import { OpenAI } from "langchain";
import { SqlToolkit, createSqlAgent } from "langchain/agents";
import { SqlDatabase } from "langchain/sql_db";
import type { NextApiRequest, NextApiResponse } from "next";
import { DataSource } from "typeorm";

export const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not defined in the environment variables.");
    res.status(500).json({ error: "Internal server error: DATABASE_URL is not defined." });
    return;
  }

  const url = new URL(process.env.DATABASE_URL);
  const datasource = new DataSource({
    type: "mysql",
    host: url.hostname,
    port: parseInt(url.port, 10) || 3306,
    username: url.username,
    password: url.password,
    database: url.pathname.substr(1) // Remove the leading "/"
  });

  try {
    await datasource.initialize();
  } catch (error) {
    console.error("Failed to initialize datasource:", error);
    res.status(500).json({ error: "Internal server error: Failed to initialize datasource." });
    return;
  }

  const db = await SqlDatabase.fromDataSource(datasource);
  const toolkit = new SqlToolkit(db);
  const model = new OpenAI({ openAIApiKey: process.env.OPENAI_API_KEY, temperature: 0 });
  const executor = createSqlAgent(model, toolkit, { topK: 10, prefix: SQL_PREFIX, suffix: SQL_SUFFIX });	
  const { query: prompt } = req.body;

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

  } catch (e: any) {
    console.log(e);		
    response.error = "Server error. Try again with a different prompt.";
  } finally {
    await datasource.destroy();
  }

  res.status(200).json(response);
};

export default handler;
