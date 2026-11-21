import "server-only";

export type StorageOffer = {currency:string; flatMonthlyMinor:number; addonMonthlyMinor:number; addonBytes:number};
let loggedInvalidOffer=false;
export function readStorageOffer(): StorageOffer | null {
  const raw=process.env.WORKSPACE_STORAGE_OFFER_JSON;
  if (!raw) return null;
  try{
    const {currency,flatMonthlyMinor,addonMonthlyMinor,addonBytes}=JSON.parse(raw) as StorageOffer;
    if(!/^[A-Z]{3}$/.test(currency)||![flatMonthlyMinor,addonMonthlyMinor,addonBytes].every(value=>Number.isSafeInteger(value)&&value>=0)||!addonBytes)throw Error();
    return {currency,flatMonthlyMinor,addonMonthlyMinor,addonBytes};
  }catch{
    if(!loggedInvalidOffer){console.warn("Workspace storage pricing is hidden until its proposal configuration is valid.");loggedInvalidOffer=true;}
    return null;
  }
}
