// 모든 페이지 앞의 입장 문: 코드를 넣지 않은 사람은 /login.html 로 (다른 파일을 불러오지 않는 독립 파일)
export const config = { matcher: ["/((?!login\\.html|api/|favicon\\.ico|robots\\.txt).*)"] };

// 입장 쿠키 서명·확인 (서버 함수와 미들웨어가 함께 씀)
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

async function key(secret){
  return crypto.subtle.importKey("raw", enc.encode(secret), {name:"HMAC", hash:"SHA-256"}, false, ["sign", "verify"]);
}
async function signSession(role, days, secret){
  const body = b64u(enc.encode(JSON.stringify({r:role, e:Date.now() + days * 864e5})));
  const sig = b64u(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return body + "." + sig;
}
async function readSession(token, secret){
  if(!token || !secret) return null;
  const [body, sig] = token.split(".");
  if(!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64u(sig), enc.encode(body));
    if(!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64u(body)));
    if(!p.e || p.e < Date.now() || !["teacher", "student"].includes(p.r)) return null;
    return p;
  } catch(e){ return null; }
}
function cookieOf(header, name){
  const m = (header || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : "";
}

const OPEN = ["/login.html", "/favicon.ico", "/robots.txt"];

export default async function middleware(request){
  const url = new URL(request.url);
  if(url.pathname.startsWith("/api/") || OPEN.includes(url.pathname)) return;
  let ok = false;
  try { ok = !!(await readSession(cookieOf(request.headers.get("cookie"), "jw"), process.env.SESSION_SECRET)); } catch(e){ ok = false; }
  if(!ok) return Response.redirect(new URL("/login.html", request.url), 302);
}
