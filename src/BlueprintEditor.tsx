import ItemEditor from './ItemEditor';
import type {EditorSection} from './components/EditorNavigation';
export default function BlueprintEditor(props:{locale:string;onBack:()=>void;onSectionSelect:(section:EditorSection)=>void}){return <ItemEditor {...props} blueprintsOnly/>;}
