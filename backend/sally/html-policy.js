const sanitize=require("sanitize-html");
const safeCss=/^(?!.*(?:url|expression|javascript|@|\\))[a-z0-9\s#.,%()'"\-+/]+$/i;
const properties=["color","background","background-color","font-family","font-size","font-weight","font-style","line-height","text-align","text-decoration","padding","padding-top","padding-bottom","padding-left","padding-right","margin","margin-top","margin-bottom","margin-left","margin-right","border","border-radius","border-color","border-width","border-style","width","max-width","height","display","vertical-align","gap","align-items","justify-content","flex","flex-direction","box-sizing"];
function cleanMoodleHtml(html){return sanitize(String(html||""),{
  allowedTags:sanitize.defaults.allowedTags.concat(["img"]),
  allowedAttributes:{...sanitize.defaults.allowedAttributes,"*":["style","class","title"],img:["src","alt","width","height"],a:["href","title","target","rel"],td:["style","colspan","rowspan"],th:["style","colspan","rowspan"]},
  allowedSchemes:["https","http","mailto"],allowProtocolRelative:false,
  allowedStyles:{"*":Object.fromEntries(properties.map(property=>[property,[safeCss]]))}
});}
module.exports={cleanMoodleHtml};
