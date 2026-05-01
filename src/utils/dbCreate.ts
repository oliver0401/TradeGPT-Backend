import mysql from "mysql";
import { Env } from "@/env";

export const dbCreate = async (): Promise<void> => {
  const connection = mysql.createConnection({
    host: Env.host,
    user: Env.username,
    password: Env.password,
    port: Env.dbPort,
  });

  await new Promise<void>((resolve, reject) => {
    connection.connect((err) => {
      if (err) {
        connection.end();
        return reject(err);
      }
      const dbName = connection.escapeId(Env.dbName);
      connection.query(
        `CREATE DATABASE IF NOT EXISTS ${dbName}`,
        (queryErr) => {
          connection.end();
          if (queryErr) return reject(queryErr);
          resolve();
        }
      );
    });
  });
};
