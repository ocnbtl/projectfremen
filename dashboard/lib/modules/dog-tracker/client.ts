"use client";
import { buildJsonHeadersWithCsrf } from "../../client-csrf";
import type { DogCareInput, DogCareEvent } from "./types";
export const PET_CHANGE_KEY="unigentamos-pets-change";
export async function updatePetCare(id:string,updatedAt:string,input:Partial<DogCareInput>):Promise<DogCareEvent>{
 const response=await fetch("/api/personal/pets",{method:"PATCH",headers:buildJsonHeadersWithCsrf(),body:JSON.stringify({entity:"care",id,expectedUpdatedAt:updatedAt,input})});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error || "Care could not be updated.");
 window.dispatchEvent(new Event(PET_CHANGE_KEY));try{localStorage.setItem(PET_CHANGE_KEY,String(Date.now()));}catch{}return result.item;
}
