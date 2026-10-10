export default function handler(req, res){
  res.setHeader("Set-Cookie", ["jw=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax", "jw_role=; Path=/; Max-Age=0; Secure; SameSite=Lax"]);
  res.writeHead(302, {Location:"/login.html"}); res.end();
}
