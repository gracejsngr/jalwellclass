// 입장 코드 확인 (독립 파일)
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

// Upstash Redis (Vercel Marketplace에서 연결) REST 호출
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const storeReady = () => !!(URL_ && TOKEN);
async function redis(...cmd){
  const r = await fetch(URL_, {method:"POST", headers:{Authorization:"Bearer " + TOKEN, "Content-Type":"application/json"}, body:JSON.stringify(cmd)});
  const j = await r.json();
  if(j.error) throw new Error(j.error);
  return j.result;
}
const H = "jw:docs";
async function getDoc(id){ const v = await redis("HGET", H, id); return v == null ? null : JSON.parse(v); }
async function setDoc(id, v){ await redis("HSET", H, id, JSON.stringify(v)); }
async function allDocs(){
  const arr = await redis("HGETALL", H) || [], out = {};
  for(let i = 0; i < arr.length; i += 2) out[arr[i]] = JSON.parse(arr[i + 1]);
  return out;
}


export default async function handler(req, res){
  if(req.method !== "POST") return res.status(405).json({error:"POST만 돼요"});
  const secret = process.env.SESSION_SECRET;
  if(!secret || !process.env.TEACHER_CODE) return res.status(500).json({error:"서버 설정(SESSION_SECRET, TEACHER_CODE)이 아직 없어요"});
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "x";
  if(storeReady()){
    const n = await redis("INCR", "jw:rl:" + ip); if(n === 1) await redis("EXPIRE", "jw:rl:" + ip, 600);
    if(n > 20) return res.status(429).json({error:"너무 많이 시도했어요. 10분 뒤에 다시 해 주세요"});
  }
  const code = String((req.body && req.body.code) || "").trim();
  const role = code && code === process.env.TEACHER_CODE ? "teacher" : code && process.env.CLASS_CODE && code === process.env.CLASS_CODE ? "student" : null;
  if(!role) return res.status(401).json({error:"코드가 맞지 않아요"});
  const days = role === "teacher" ? 30 : 180, token = await signSession(role, days, secret), age = days * 86400;
  res.setHeader("Set-Cookie", [
    `jw=${token}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`,
    `jw_role=${role}; Path=/; Max-Age=${age}; Secure; SameSite=Lax`
  ]);
  return res.status(200).json({ok:true, role});
}
