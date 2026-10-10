import { signSession } from "../lib/auth.js";
import { redis, storeReady } from "../lib/store.js";

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
