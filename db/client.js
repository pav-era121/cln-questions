const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

const TURSO_URL = process.env.TURSO_DATABASE_URL || 'libsql://cln-questions-pav-era121.aws-eu-west-1.turso.io';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTA2MDIwNjAsImlkIjoiMDFhMGU4MzEtOTgwMS03NmY1LTlkZjktNDA2MWExOTNhMzU1Iiwia2lkIjoibGExZEtRazFyUGMzWkdiY1dxZlRBQU1fVVBBTFd4WGx1WWRvYTE1RTR6SSIsInJpZCI6ImEwYzFiOTRjLTZlM2EtNDY5ZS1iYzA3LWRkODljOTlhYzM2MSJ9.87Aev4kX789LCbXv5n1mhKdj00VpnaJQYJptaUPT1fPsBL0aJgV00sk_15rHxaDuUgt7EMFAI79iLoE8xJrdAg';

let db;

if (TURSO_URL) {
  console.log('Connecting to Turso Cloud SQLite database...');
  const client = createClient({
    url: TURSO_URL,
    authToken: TURSO_AUTH_TOKEN
  });

  db = {
    isTurso: true,
    prepare(sql) {
      return {
        async all(...args) {
          const flatArgs = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          const res = await client.execute({ sql, args: flatArgs });
          return res.rows;
        },
        async get(...args) {
          const flatArgs = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          const res = await client.execute({ sql, args: flatArgs });
          return res.rows[0];
        },
        async run(...args) {
          const flatArgs = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          const res = await client.execute({ sql, args: flatArgs });
          return { changes: res.rowsAffected, lastInsertRowid: res.lastInsertRowid };
        }
      };
    },
    async exec(sql) {
      return await client.executeMultiple(sql);
    }
  };
} else {
  console.log('Connecting to local SQLite database...');
  const { DatabaseSync } = require('node:sqlite');
  const localDbDir = path.join(__dirname);
  const localDbPath = path.join(localDbDir, 'cln.db');
  const syncDb = new DatabaseSync(localDbPath);
  syncDb.exec('PRAGMA foreign_keys = ON;');

  db = {
    isTurso: false,
    prepare(sql) {
      const stmt = syncDb.prepare(sql);
      return {
        async all(...args) {
          return stmt.all(...args);
        },
        async get(...args) {
          return stmt.get(...args);
        },
        async run(...args) {
          return stmt.run(...args);
        }
      };
    },
    async exec(sql) {
      return syncDb.exec(sql);
    }
  };
}

module.exports = db;
