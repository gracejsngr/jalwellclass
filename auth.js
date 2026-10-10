// 입장 쿠키 서명·확인 (서버 함수와 미들웨어가 함께 씀)
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

async function key(secret){
  return crypto.subtle.importKey("raw", enc.encode(secret), {name:"HMAC", hash:"SHA-256"}, false, ["sign", "verify"]);
}
export async function signSession(role, days, secret){
  const body = b64u(enc.encode(JSON.stringify({r:role, e:Date.now() + days * 864e5})));
  const sig = b64u(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return body + "." + sig;
}
export async function readSession(token, secret){
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
export function cookieOf(header, name){
  const m = (header || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : "";
}
