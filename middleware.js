// 모든 페이지 앞의 입장 문: 코드를 넣지 않은 사람은 /login.html 로
import { readSession, cookieOf } from "./lib/auth.js";

export const config = { matcher: ["/((?!login\\.html|api/login|favicon\\.ico|robots\\.txt).*)"] };

export default async function middleware(request){
  const url = new URL(request.url);
  if(url.pathname.startsWith("/api/")) return; // API는 각 함수가 직접 확인
  const s = await readSession(cookieOf(request.headers.get("cookie"), "jw"), process.env.SESSION_SECRET);
  if(!s) return Response.redirect(new URL("/login.html", request.url), 302);
}
