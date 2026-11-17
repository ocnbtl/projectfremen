import { normalizeMediaOrganization, type UploadDetails } from "./organization";
/** Read only a bounded local header. Never send photo bytes to a metadata service. */
export async function readPhotoDetails(file:File,includeLocation:boolean):Promise<Partial<UploadDetails>>{
 if(!/^image\//.test(file.type)&&! /\.(jpe?g|png|heic|heif|avif|tiff?)$/i.test(file.name))return {};
 try{
  const {parse}=await import("exifr");
  const raw=await parse(await file.slice(0,2*1024*1024).arrayBuffer(),{tiff:true,exif:true,gps:includeLocation,iptc:true,xmp:false,icc:false,ihdr:true,reviveValues:false,pick:["DateTimeOriginal","Make","Model","ImageWidth","ImageHeight","ExifImageWidth","ExifImageHeight","Artist","Copyright","ImageDescription","ObjectName","Keywords","GPSLatitude","GPSLongitude","GPSLatitudeRef","GPSLongitudeRef"]});
  if(!raw)return {};
  const string=(value:unknown,max=240)=>typeof value==="string"?value.trim().slice(0,max):"";
  const captured=string(raw.DateTimeOriginal).replace(/^(\d{4}):(\d{2}):(\d{2}) /,"$1-$2-$3T").slice(0,19);
  const dimension=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>0&&Number(value)<=100000?Number(value):undefined;
  const metadata=normalizeMediaOrganization({metadata:{...(captured&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(captured)&&Number.isFinite(Date.parse(captured+"Z"))?{capturedAt:captured}:{}),camera:[string(raw.Make),string(raw.Model)].filter(Boolean).join(" "),width:dimension(raw.ExifImageWidth||raw.ImageWidth),height:dimension(raw.ExifImageHeight||raw.ImageHeight),creator:string(raw.Artist),copyright:string(raw.Copyright)}}).metadata;
  const tags=(Array.isArray(raw.Keywords)?raw.Keywords:typeof raw.Keywords==="string"?[raw.Keywords]:[]).filter((v:unknown)=>typeof v==="string").slice(0,30).map((v:string)=>v.slice(0,60));
  const location=includeLocation&&Number.isFinite(raw.latitude)&&Number.isFinite(raw.longitude)&&Math.abs(raw.latitude)<=90&&Math.abs(raw.longitude)<=180?{latitude:raw.latitude,longitude:raw.longitude,source:"embedded" as const}:undefined;
  return {metadata,tags,...(location?{location}:{}),...(string(raw.ObjectName)?{title:string(raw.ObjectName)}:{}),description:string(raw.ImageDescription,2000)};
 }catch{return {};}
}
