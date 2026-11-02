'use strict';
exports.renderer=`
var SUPPORTED_LOCALES = ["en"];
var HTML_LANG = {en:"en"};
var CONTENT_LANG_BY_LOCALE = {en:"en"};
function createDesktopLocaleAdapter(systemLocale) {return {getUserChoice:()=>null};}
function UserLocaleSync(){
 const userLanguage = useAuthStore((s) => s.user?.language ?? null);
 const adapter=useLocaleAdapter();
 if (!userLanguage) return;
}
function LanguageRow(){
 const languageOptions = [];
 const user=true;
 if (user) try {}catch{}
 return languageOptions;
}
function StickyCommentBarRow(){}
function Calendar({locale,formatters}){
 const defaultClassNames = getDefaultClassNames();
 return {
\t\tcaptionLayout,
\t\tlocale,
\t\tformatters:{
\t\t\t...formatters
  }
 };
}
function CalendarDayButton(){}
//#region ../../packages/views/locales/en/common.json
var common_default={save:"Save",cancel:"Cancel"};
var RESOURCES = {en:{common:common_default}};
//#endregion
`;
exports.main=`let electron = require("electron");
var labels = {en:{title:"Quit Multica"}};
function quitLabels(preferredLanguage){
 const preferred = preferredLanguage.toLowerCase();
 return labels.en;
}
var labelsByLocale = {en:{openLink:"Open Link in Browser"}};
function pickLabels(){
 const preferred = electron.app.getPreferredSystemLanguages()[0]?.toLowerCase() ?? "";
 return labelsByLocale.en;
}
`;
