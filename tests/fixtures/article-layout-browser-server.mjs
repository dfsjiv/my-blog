// Local integration fixture. No production data or credentials.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { handleKnowledgeRequest } from '../../functions/lib/knowledge-api.mjs';
const rootDir=path.resolve(import.meta.dirname,'../..');
class D1Statement {
    constructor(database, sql, bindings = []) {
        this.database = database;
        this.sql = sql;
        this.bindings = bindings;
    }

    bind(...bindings) {
        return new D1Statement(this.database, this.sql, bindings);
    }

    first() {
        return this.database.prepare(this.sql).get(...this.bindings) || null;
    }

    all() {
        return {
            success: true,
            results: this.database.prepare(this.sql).all(...this.bindings)
        };
    }

    run() {
        return runStatement(this.database, this.sql, this.bindings);
    }
}

class D1Database {
    constructor(database) {
        this.database = database;
    }

    prepare(sql) {
        return new D1Statement(this.database, sql);
    }

    batch(statements) {
        this.database.exec("BEGIN");
        try {
            const results = statements.map((statement) => {
                const prepared = this.database.prepare(statement.sql);
                if (/^\s*(SELECT|WITH)\b/i.test(statement.sql)) {
                    return {
                        success: true,
                        results: prepared.all(...statement.bindings),
                        meta: { changes: 0 }
                    };
                }
                return runStatement(this.database, statement.sql, statement.bindings);
            });
            this.database.exec("COMMIT");
            return results;
        }
        catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }
}

function runStatement(database, sql, bindings) {
    const result = database.prepare(sql).run(...bindings);
    return {
        success: true,
        meta: {
            changes: Number(result.changes),
            last_row_id: Number(result.lastInsertRowid)
        }
    };
}

function createDatabase() {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL,
            role TEXT NOT NULL
        );
        INSERT INTO users (id, username, role)
        VALUES (1, 'Lee Ethan', 'admin'), (2, 'reader', 'user');
        CREATE TABLE articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            summary TEXT,
            content TEXT NOT NULL,
            category TEXT NOT NULL CHECK(category IN ('algorithm','computer','essay')),
            author_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(author_id) REFERENCES users(id)
        );
    `);
    sqlite.exec(fs.readFileSync(
        path.join(rootDir, "migrations", "0002_add_knowledge_content.sql"),
        "utf8"
    ));
    sqlite.exec(fs.readFileSync(
        path.join(rootDir, "migrations", "0003_add_knowledge_migration_map.sql"),
        "utf8"
    ));
    sqlite.exec(fs.readFileSync(
        path.join(rootDir, "migrations", "0004_add_external_article_mover.sql"),
        "utf8"
    ));
    sqlite.exec(fs.readFileSync(
        path.join(rootDir, "migrations", "0005_add_knowledge_favorites.sql"),
        "utf8"
    ));
    sqlite.exec(fs.readFileSync(
        path.join(rootDir, "migrations", "0009_add_knowledge_backgrounds.sql"),
        "utf8"
    ));
    return { sqlite, DB: new D1Database(sqlite) };
}


const env=createDatabase();
for(const n of ['0013_add_extensible_post_presentation.sql','0015_add_article_layouts.sql']) env.sqlite.exec(fs.readFileSync(path.join(rootDir,'migrations',n),'utf8'));
http.createServer(async(incoming,outgoing)=>{
 try{
  const url=new URL(incoming.url,'http://127.0.0.1:39801');
  const chunks=[];for await(const chunk of incoming)chunks.push(chunk);const body=chunks.length?Buffer.concat(chunks):undefined;
  let response;
  if(/^\/api\/knowledge\/(?:posts|facets|admin\/posts)(?:[/?]|$)/.test(url.pathname)){
   const request=new Request(url,{method:incoming.method,headers:incoming.headers,body});
   response=await handleKnowledgeRequest({request,env,url,jsonResponse:(data,status=200)=>Response.json(data,{status}),getBearerToken:r=>r.headers.get('authorization')?.replace(/^Bearer /,''),getAuthenticatedUser:async token=>token==='fixture-admin-token'?{id:1,username:'Local Admin',role:'admin'}:token==='fixture-user-token'?{id:2,username:'Local Reader',role:'user'}:null});
  }else response=await fetch('http://127.0.0.1:39800'+incoming.url,{method:incoming.method,headers:incoming.headers,body});
  const responseHeaders=Object.fromEntries([...response.headers].filter(([key])=>!['content-encoding','content-length','transfer-encoding'].includes(key)));
  if(url.pathname.startsWith('/assets/vendor/katex/fonts/')) responseHeaders['Access-Control-Allow-Origin']='*';
  outgoing.writeHead(response.status,responseHeaders);outgoing.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){outgoing.writeHead(500);outgoing.end(e.message);}
}).listen(39801,'127.0.0.1',()=>console.log('Article layout fixture: http://127.0.0.1:39801'));

