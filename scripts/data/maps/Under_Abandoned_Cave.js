registerUnderkeepMap({
"id": "Under_Abandoned_Cave",
"bounds": [12,-39,14,16],
"tileCount": 132,
"sourceCount": 43,
"zone": "cave_env",
"focusBounds": [14.5,-36.5,9,11],
"markers": [
{"id":248,"key":"cave_exit2_up","xy":[17,-31],"code":"A01","title":"上樓 → 廢棄洞窟","detail":{"落點":"17, -31","洞口方向":"東"},"destination":{"map":"Abandoned_Mines_Cave","xy":[17,-31],"id":253,"name":"廢棄洞窟"},"rotation":90,"nativeRotation":90},
{"id":267,"key":"cave_alcove","xy":[18,-35],"code":"L01","detail":{"戰利品":"治療藥水、次級體力藥水"},"nativeRotation":90,"itemLinks":{"戰利品":[[0,4,"item_heal_potion"],[5,11,"item_minor_endurance_potion"]]}},
{"id":249,"key":"garbage1","xy":[21,-33],"code":"L02","detail":{"翻不到東西":"0%（首次翻找）","戰利品":"自然斗篷"},"itemLinks":{"戰利品":[[0,4,"item_cloak_of_nature"]]}},
{"id":260,"key":"crate1_moss","xy":[15,-27],"code":"L03","title":"可打破容器","detail":{"戰利品":"法力藥水"},"detailOrder":["戰利品","取得方式"],"itemLinks":{"戰利品":[[0,4,"item_mana_potion"]]}},
{"id":274,"key":"item_mushroom1","xy":[22,-32],"code":"I03"},
{"id":255,"key":"item_minor_endurance_potion","xy":[16,-30],"code":"I05"},
{"id":268,"key":"item_buckler","xy":[16,-30],"code":"I06"},
{"id":273,"key":"item_mushroom1","xy":[15,-27],"code":"I09"},
{"id":241,"key":"pit_cave_outfall","xy":[15,-34],"code":"N01","title":"地坑落點","detail":{"用途":"從來源地坑落下後會抵達這一格。","來源地坑":"廢棄洞窟 (15, -34)"}},
{"id":243,"key":"pit_cave_outfall","xy":[21,-31],"code":"N02","title":"地坑落點","detail":{"用途":"從來源地坑落下後會抵達這一格。","來源地坑":"廢棄洞窟 (21, -31)"}},
{"id":247,"key":"pit_cave_outfall","xy":[22,-31],"code":"N03","title":"地坑落點","detail":{"用途":"從來源地坑落下後會抵達這一格。","來源地坑":"廢棄洞窟 (22, -31)"}},
{"id":242,"key":"pit_cave_outfall","xy":[15,-27],"code":"N04","title":"地坑落點","detail":{"用途":"從來源地坑落下後會抵達這一格。","來源地坑":"廢棄洞窟 (15, -27)"}},
{"id":252,"key":"item_bones03","xy":[15,-34],"code":"J01"},
{"id":253,"key":"item_bones02","xy":[15,-34],"code":"J02"},
{"id":254,"key":"item_bones04","xy":[16,-30],"code":"J03"},
{"id":256,"key":"item_bones01","xy":[15,-27],"code":"J04"},
{"id":257,"key":"item_bones06","xy":[15,-27],"code":"J05"},
{"id":269,"key":"cave_gold_wall","xy":[22,-29],"code":"V01"}
],
"objects": {
"item_buckler": {"type":"item","title":"小圓盾","detail":{"可取得":"小圓盾"},"sprite":"item_buckler","rotation":0,"native":null,"nativeRotation":0,"isChest":false,"itemLinks":{"可取得":[[0,3,"item_buckler"]]},"titleLinks":[[0,3,"item_buckler"]]}
}
});
