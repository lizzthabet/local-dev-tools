// This code and approach has been generously borrowed from:
// https://dev.to/adamcoster/create-a-live-reload-server-for-front-end-development-3gnp
// and tweaked with Typescript
import { IncomingMessage, ServerResponse, createServer as createHttpServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, normalize } from 'path'
import { Server as WebSocketServer } from 'ws'

// Customize the port you want your server to run on
const HTTP_PORT = 6700;
// Customize the port the websocket connection uses
// Note: update it both here and `client-websocket.ts`
const WEBSOCKET_PORT = 6800;
const CLIENT_WEBSOCKET_CODE = readFileSync(join(__dirname,'client-websocket.js'),'utf8');
// Most static sites have a `public` folder with everything in it.
// Customize this if it's a different folder.
const SERVE_CONTENT_FROM = "public"

// Websocket server (for allowing browser and dev server to have 2-way communication)
// We don't even need to do anything except create the instance!
new WebSocketServer({ port: WEBSOCKET_PORT });

// Get the file content and if it exists, inject the websocket snippet
function getFileIfExists(route: string): Buffer | null {
  // We don't care about performance for a dev server, so sync functions are fine.
  // If the route exists it's either the exact file we want or the path to a directory
  // in which case we'd serve up the 'index.html' file.
  if (existsSync(route)) {
    const fileStat = statSync(route)
    if (fileStat.isDirectory()) {
      return getFileIfExists(join(route,'index.html'));
    }

    if (fileStat.isFile()) {
      const file: Buffer = readFileSync(route);
      if (route.endsWith('.html')) {
        // Inject the client-side websocket code by adding the script to the end
        // browsers allow for tons of deviation from *technically correct* HTML.
        const fileWithReloadScript = `${file.toString()}\n\n<script>${CLIENT_WEBSOCKET_CODE}</script>`
        return Buffer.from(fileWithReloadScript)
      }

      return file
    }
  }

  return null
}

/** General request handler and router */
const requestHandler = function (req: IncomingMessage, res: ServerResponse) {
  console.log(`request for ${req.url}`)
  const method = req.method.toLowerCase();
  if (method === 'get') {
    // No need to ensure the route can't access other local files,
    // since this is for development only.
    const url = new URL(req.url, `http://${req.headers.host}`)
    const route = normalize(join(__dirname, SERVE_CONTENT_FROM, decodeURI(url.pathname)))
    const staticFile = getFileIfExists(route)
    if (staticFile) {
      res.writeHead(200)
      res.end(staticFile)
      return
    }
  }
  res.writeHead(404)
  res.end()
  return
}

const server = createHttpServer(requestHandler)
server.listen(HTTP_PORT)
console.log(`Server listening port ${HTTP_PORT}...`)