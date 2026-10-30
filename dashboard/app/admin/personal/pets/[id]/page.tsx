import PersonalUtilityRoutePage from "../../PersonalUtilityRoutePage";
export const dynamic = "force-dynamic";
export default async function PetPage({params}:{params:Promise<{id:string}>}) { const {id}=await params; return <PersonalUtilityRoutePage view="dog" petId={id} />; }
