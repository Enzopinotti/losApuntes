import type { PortableStudyKitArchive } from "./study-portable-kits.mjs";
export declare function saveStudyKitWorkspace(scope:string, archive:PortableStudyKitArchive, now?:number): boolean;
export declare function loadStudyKitWorkspace(scope:string,now?:number): PortableStudyKitArchive|null;
export declare function forgetStudyKitWorkspace(scope:string):boolean;
