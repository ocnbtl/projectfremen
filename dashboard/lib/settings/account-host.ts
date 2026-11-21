import "server-only";

export function accountSettingsUrl(){
  const configured=process.env.UNIGENTAMOS_ACCOUNT_ORIGIN;
  if(!configured)return undefined;
  try{
    const url=new URL(configured);
    if(url.username||url.password||url.protocol!=="https:")return undefined;
    return new URL("/account",url.origin).href;
  }catch{return undefined;}
}
