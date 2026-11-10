import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
export type TaskUndoReceipt={title:string;command:Record<string,unknown>};
export async function writeTask(input:Record<string,unknown>){
 const response=await fetch("/api/planning/tasks",{method:"POST",headers:buildJsonHeadersWithCsrf(),body:JSON.stringify({...input,withUndo:input.operation==="complete"&&input.completed===true})});
 const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||"Task could not be saved");
 if(result.item?.undo)window.dispatchEvent(new CustomEvent<TaskUndoReceipt>("unigentamos-task-completed",{detail:result.item.undo}));
 window.dispatchEvent(new Event("unigentamos-tasks-changed"));return result.item?.undo?result.item.result:result.item;
}
