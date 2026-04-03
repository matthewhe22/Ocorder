// test/request-factory.js
// Creates mock req/res objects for testing Vercel serverless handlers.
// Implements the minimal subset of the Node.js http.IncomingMessage /
// http.ServerResponse API that the app's handlers actually use.

export function makeReq({ method = "GET", body = {}, headers = {}, query = {} } = {}) {
  return { method, body, headers, query };
}

export function makeRes() {
  const res = {
    _status: null,
    _body: null,
    _headers: {},
    _redirectUrl: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    end() { return this; },
    send(body) { this._body = body; return this; },
    setHeader(k, v) { this._headers[k] = v; return this; },
    redirect(code, url) { this._status = code; this._redirectUrl = url; return this; },
    get headersSent() { return this._status !== null; },
  };
  return res;
}
