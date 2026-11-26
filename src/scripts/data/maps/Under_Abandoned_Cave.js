registerUnderkeepMap({
"id": "Under_Abandoned_Cave",
"bounds": [12,-39,14,16],
"tileCount": 132,
"sourceCount": 43,
"zone": "cave_env",
"focusBounds": [14.5,-36.5,9,11],
"markers": [
{"id":248,"key":"cave_exit2_up","xy":[17,-31],"code":"A01","title":"{{t:maps.points.under_abandoned_cave.a01.title}}","detail":{"{{t:common.landing}}":"17, -31","{{t:common.entrance-direction}}":"{{t:common.east}}"},"destination":{"map":"Abandoned_Mines_Cave","xy":[17,-31],"id":253,"name":"{{t:maps.names.abandoned_mines_cave}}"},"rotation":90,"nativeRotation":90},
{"id":267,"key":"cave_alcove","xy":[18,-35],"code":"L01","detail":{"{{t:common.loot}}":"{{t:maps.points.forgotten_vein.l03.detail}}"},"nativeRotation":90,"itemLinks":{"{{t:common.loot}}":[[0,4,"item_heal_potion"],[5,11,"item_minor_endurance_potion"]]}},
{"id":249,"key":"garbage1","xy":[21,-33],"code":"L02","detail":{"{{t:common.nothing-found}}":"{{t:maps.points.abandoned_mines_cave.l01.detail}}","{{t:common.loot}}":"{{t:guide.item_cloak_of_nature}}"},"itemLinks":{"{{t:common.loot}}":[[0,4,"item_cloak_of_nature"]]}},
{"id":260,"key":"crate1_moss","xy":[15,-27],"code":"L03","title":"{{t:common.breakable-container}}","detail":{"{{t:common.loot}}":"{{t:guide.item_mana_potion}}"},"detailOrder":["{{t:common.loot}}","{{t:common.acquire-method}}"],"itemLinks":{"{{t:common.loot}}":[[0,4,"item_mana_potion"]]}},
{"id":274,"key":"item_mushroom1","xy":[22,-32],"code":"I03"},
{"id":255,"key":"item_minor_endurance_potion","xy":[16,-30],"code":"I05"},
{"id":268,"key":"item_buckler","xy":[16,-30],"code":"I06"},
{"id":273,"key":"item_mushroom1","xy":[15,-27],"code":"I09"},
{"id":241,"key":"pit_cave_outfall","xy":[15,-34],"code":"N01","title":"{{t:common.pit-landing}}","detail":{"{{t:common.purpose}}":"{{t:maps.points.abandoned_mines_cave.n01.detail}}","{{t:common.source-pit}}":"{{t:maps.points.under_abandoned_cave.n01.detail}}"}},
{"id":243,"key":"pit_cave_outfall","xy":[21,-31],"code":"N02","title":"{{t:common.pit-landing}}","detail":{"{{t:common.purpose}}":"{{t:maps.points.abandoned_mines_cave.n01.detail}}","{{t:common.source-pit}}":"{{t:maps.points.under_abandoned_cave.n02.detail}}"}},
{"id":247,"key":"pit_cave_outfall","xy":[22,-31],"code":"N03","title":"{{t:common.pit-landing}}","detail":{"{{t:common.purpose}}":"{{t:maps.points.abandoned_mines_cave.n01.detail}}","{{t:common.source-pit}}":"{{t:maps.points.under_abandoned_cave.n03.detail}}"}},
{"id":242,"key":"pit_cave_outfall","xy":[15,-27],"code":"N04","title":"{{t:common.pit-landing}}","detail":{"{{t:common.purpose}}":"{{t:maps.points.abandoned_mines_cave.n01.detail}}","{{t:common.source-pit}}":"{{t:maps.points.under_abandoned_cave.n04.detail}}"}},
{"id":252,"key":"item_bones03","xy":[15,-34],"code":"J01"},
{"id":253,"key":"item_bones02","xy":[15,-34],"code":"J02"},
{"id":254,"key":"item_bones04","xy":[16,-30],"code":"J03"},
{"id":256,"key":"item_bones01","xy":[15,-27],"code":"J04"},
{"id":257,"key":"item_bones06","xy":[15,-27],"code":"J05"},
{"id":269,"key":"cave_gold_wall","xy":[22,-29],"code":"V01"}
],
"objects": {
"item_buckler": {"type":"item","title":"{{t:guide.item_buckler}}","detail":{"{{t:common.available-items}}":"{{t:guide.item_buckler}}"},"sprite":"item_buckler","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"{{t:common.available-items}}":[[0,3,"item_buckler"]]},"titleLinks":[[0,3,"item_buckler"]]}
}
});
