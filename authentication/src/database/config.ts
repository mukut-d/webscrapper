import { Client } from 'pg';

const client = new Client({
  user: process.env.DB_USERNAME,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

(async () => {
  await client.connect();

  await client.query('SELECT NOW()');
  await client.end();
})();
