// test/request-factory.js — Mock req/res factory for Vercel serverless handlers
// All Vercel handlers are plain async function handler(req, res).
// This factory creates minimal mock objects that implement the subset used by the app.

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
