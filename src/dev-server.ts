// This code and approach has been generously borrowed from:
// https://dev.to/adamcoster/create-a-live-reload-server-for-front-end-development-3gnp
// and tweaked with Typescript
import { IncomingMessage, OutgoingHttpHeaders, ServerResponse, createServer as createHttpServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, normalize, extname } from 'path'
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

function parseFilenameIfExists(route: string): string | null {
  const noExtension = extname(route) === ''
  const fileExists = existsSync(route)
  if (fileExists) {
    const fileStat = statSync(route)
    // If the requested file is a directory, assume there's an index page to serve
    if (fileStat.isDirectory()) {
      return join(route, 'index.html');
    } else if (fileStat.isFile()) {
      return route
    }
  }
  
  // If there's no extension and file doesn't exist, let's try parsing the route
  // as an html file and serve it if it's present
  if (!fileExists && noExtension) {
    const htmlFilePath = `${route}.html`
    if (existsSync(htmlFilePath)) {
      return htmlFilePath
    }
  }

  return null
}

// Get the file content and if it exists, inject the websocket snippet
function getFileIfExists(route: string): Buffer | null {
  // We don't care about performance for our dev server, so sync functions are fine.
  // If the route exists it's either the exact file we want or the path to a directory
  // in which case we'd serve up the 'index.html' file.
  const filepath = parseFilenameIfExists(route)
  if (filepath) {
    const file: Buffer = readFileSync(filepath);
    if (extname(filepath) === ".html") {
      // Inject the client-side websocket code by adding the script to the end;
      // browsers allow for tons of deviation from *technically correct* HTML.
      const fileWithReloadScript = `${file.toString()}\n\n<script>${CLIENT_WEBSOCKET_CODE}</script>`
      return Buffer.from(fileWithReloadScript)
    }

    return file
  }

  return null
}

// Add headers for specific media types that browsers are picky about
function getHeadersForRoute(route: string): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {}
  if (extname(route) === ".svg") {
    headers["Content-Type"] = "image/svg+xml"
  }

  return headers
}

/** General request handler and router */
const requestHandler = function (req: IncomingMessage, res: ServerResponse) {
  console.log(`> > request for ${req.url}`)
  const method = req.method.toLowerCase();
  if (method === 'get') {
    // No need to ensure the route can't access other local files,
    // since this is for development only.
    const url = new URL(req.url, `http://${req.headers.host}`)
    const route = normalize(join(__dirname, SERVE_CONTENT_FROM, decodeURI(url.pathname)))
    const staticFile = getFileIfExists(route)
    if (staticFile !== null) {
      const headers = getHeadersForRoute(route)
      res.writeHead(200, headers)
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