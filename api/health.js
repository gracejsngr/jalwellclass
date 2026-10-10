// 설정 점검 (독립 파일)
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

// 설정 점검용: 비밀값 자체는 보여 주지 않고 '있음/없음'만 알려 줌

export default async function handler(req, res){
  const out = {
    TEACHER_CODE: !!process.env.TEACHER_CODE,
    CLASS_CODE: !!process.env.CLASS_CODE,
    SESSION_SECRET: !!process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 20,
    store_url: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
    store_token: !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
    store_env_names: Object.keys(process.env).filter(k => /KV|REDIS|UPSTASH/i.test(k)),
    store_ping: null, node: process.version
  };
  if(storeReady()){ try { out.store_ping = await redis("PING"); } catch(e){ out.store_ping = "실패: " + String(e.message || e).slice(0, 120); } }
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(out);
}
