/** Public indicator definitions shared by the picker, server and saved views. */
export type MapMetricDefinition = { name: string; description: string; icon: string; category: string; unit: string; indicator?: string };
export const MAP_CATALOG: Record<string, MapMetricDefinition> = {
 "world-population": {name:"Population", description:"Total residents", icon:"module-people", category:"People", unit:"people", indicator:"SP.POP.TOTL"},
 "world-density": {name:"Population density", description:"Residents per square kilometer", icon:"view-grid", category:"People", unit:"people / km²", indicator:"EN.POP.DNST"},
 "world-urban": {name:"Urban population", description:"Share living in urban areas", icon:"organization", category:"People", unit:"% of population", indicator:"SP.URB.TOTL.IN.ZS"},
 "world-life": {name:"Life expectancy", description:"Expected years of life at birth", icon:"module-personal", category:"People", unit:"years", indicator:"SP.DYN.LE00.IN"},
 "world-gdp": {name:"GDP per person", description:"Economic output per resident", icon:"module-finance", category:"Economy", unit:"current USD / person", indicator:"NY.GDP.PCAP.CD"},
 "world-unemployment": {name:"Unemployment", description:"Share of labor force without work", icon:"briefcase", category:"Economy", unit:"% of labor force", indicator:"SL.UEM.TOTL.ZS"},
 "world-internet": {name:"Internet use", description:"Residents using the internet", icon:"website", category:"Infrastructure", unit:"% of population", indicator:"IT.NET.USER.ZS"},
 "world-electricity": {name:"Electricity access", description:"Residents with electricity", icon:"sparkles", category:"Infrastructure", unit:"% of population", indicator:"EG.ELC.ACCS.ZS"},
 "world-water": {name:"Drinking water", description:"Access to basic drinking water", icon:"droplet", category:"Infrastructure", unit:"% of population", indicator:"SH.H2O.BASW.ZS"},
 "world-forest": {name:"Forest cover", description:"Share of land covered by forest", icon:"module-map", category:"Environment", unit:"% of land area", indicator:"AG.LND.FRST.ZS"},
 "world-renewables": {name:"Renewable energy", description:"Share of final energy consumption", icon:"routine", category:"Environment", unit:"% of energy use", indicator:"EG.FEC.RNEW.ZS"},
 "world-air": {name:"Air pollution", description:"Annual exposure to fine particles", icon:"view-grid", category:"Environment", unit:"PM2.5 µg / m³", indicator:"EN.ATM.PM25.MC.M3"},
 "regional-population": {name:"Population estimate", description:"Estimated residents", icon:"module-people", category:"People", unit:"people"},
 "regional-density": {name:"Population density", description:"Residents per square kilometer", icon:"view-grid", category:"People", unit:"people / km²"},
 population: {name:"Population", description:"Total residents", icon:"module-people", category:"People", unit:"people"},
 age: {name:"Median age", description:"Midpoint of resident ages", icon:"clock", category:"People", unit:"years"},
 income: {name:"Household income", description:"Median annual household income", icon:"module-finance", category:"Economy", unit:"USD"},
};
export const MAP_PALETTES: Record<string, {name: string; colors: string[]}> = {
 terrain: {name:"Leaf to ocean", colors:["#edf8b1", "#addd8e", "#41b6c4", "#2c7fb8", "#253494"]},
 indigo: {name:"Indigo", colors:["#eeedf7", "#c5c0e1", "#9a90c4", "#70629f", "#433267"]},
 forest: {name:"Forest", colors:["#edf8e9", "#bae4b3", "#74c476", "#31a354", "#006d2c"]},
 ember: {name:"Amber to plum", colors:["#fff3c4", "#fbcf83", "#e9996a", "#b76676", "#713f70"]},
};
