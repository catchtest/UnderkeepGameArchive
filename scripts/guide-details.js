'use strict';

const guideDetails = (() => {
  const guide = {
"icons": ["face_100","face_201","face_300","face_400","face_500","face_600","item_amulet_ironbind_wizard","item_amulet_of_adventurer","item_amulet_of_freezing","item_amulet_of_health","item_amulet_of_protection","item_amulet_of_seven_currents","item_amulet_of_sun","item_amulet_of_thunder","item_amulet_sellsword_charm","item_archmages_seal","item_armor_brigandine","item_armor_chain","item_armor_hardened","item_armor_ironveil","item_armor_moonsteel","item_armor_of_arrowcatcher","item_armor_of_emberspike","item_armor_plate","item_armor_scale","item_armor_spiked","item_armor_whispering","item_axe_01","item_axe_02","item_axe_03","item_axe_04","item_axe_05","item_axe_06","item_axe_07","item_axe_08","item_axe_09","item_axe_campbreaker","item_belt_of_bull","item_belt_of_focused_breath","item_belt_of_major_evasion","item_belt_of_marksman","item_belt_of_minor_evasion","item_belt_of_second_wind","item_belt_of_sun","item_boots_01","item_boots_chain","item_boots_chain_rusty","item_boots_embertail_slippers","item_boots_froststep","item_boots_moonsteel","item_boots_of_striking","item_boots_plate","item_boots_sandals","item_boots_scale","item_boots_scoutwing","item_boots_whispering","item_bracers_leather","item_brass_knuckles","item_buckler","item_butchers_hook","item_cinderboots","item_cloak_gravemantle","item_cloak_of_arcane_restoration","item_cloak_of_archmage","item_cloak_of_dragon","item_cloak_of_emptiness","item_cloak_of_firesparks","item_cloak_of_ironveil","item_cloak_of_nature","item_cloak_of_shadows","item_cloak_of_striking","item_cloak_of_venomward","item_cloak_spike","item_club_01","item_club_02","item_club_03","item_crimson_ring","item_crossbow_heavy","item_crossbow_light","item_dagger","item_dagger_blood","item_dagger_cobra","item_dagger_nightsting","item_dagger_viper","item_dagger_void","item_dagger_withered_rose","item_drakkan_monk_robe","item_dull_amulet","item_duroks_promise","item_echo_charm","item_emberskin_mitts","item_embersteel_amulet","item_embersteel_gauntlets","item_fixme","item_flail","item_food_major_mushroom_stew","item_food_minor_mushroom_stew","item_food_toast","item_generic_balduran_medail","item_generic_copper_ring","item_generic_lich_sock","item_gloves_alligator","item_gloves_chain","item_gloves_leather","item_gloves_moonsteel","item_gloves_of_striking","item_gloves_of_the_sun","item_gloves_of_walking_stars","item_gloves_plate","item_gloves_scale","item_gloves_spiritweave","item_gloves_thunder","item_gloves_whispering","item_hat_of_archmage","item_hat_of_fire","item_hat_of_winter","item_hat_of_wisdom","item_helm_of_bull","item_helm_of_striking","item_helmet_01","item_helmet_02","item_helmet_barbarian","item_helmet_crown_of_lightning","item_helmet_hat","item_helmet_miner","item_helmet_moonsteel","item_helmet_of_dominance","item_helmet_of_lucky_farsight","item_helmet_plate","item_helmet_scale","item_helmet_scale_rusty","item_hunting_sling","item_iron_knuckles","item_iron_shield","item_jacob_axe","item_khelebar_amulet","item_longbow","item_longbow_gravecaller","item_longbow_jacob","item_longbow_of_striking","item_mace","item_mace_gravecleft","item_mace_of_staggering_blow","item_mace_of_stars","item_mantle_of_bloodflow","item_marksman_bracers","item_maul","item_mindstep_sandals","item_monk_tunic","item_potion_armor","item_potion_cure_poison","item_potion_evasion","item_potion_frostvein","item_potion_heal_and_mana","item_potion_heal_and_stamina","item_potion_heal_medium","item_potion_heal_small","item_potion_mana_medium","item_potion_mana_small","item_potion_mana_up","item_potion_poison","item_potion_resist","item_potion_resurrect","item_potion_stamina_medium","item_potion_stamina_small","item_potion_thunderwake","item_rake","item_ranger_dagger","item_red_mask","item_ring_beastbane","item_ring_marksman_signet","item_ring_of_blood","item_ring_of_bull","item_ring_of_corpsebane","item_ring_of_elemental_res","item_ring_of_firespark","item_ring_of_gravebane","item_ring_of_lightning_bolt","item_ring_of_major_evasion","item_ring_of_minor_evasion","item_ring_of_minor_health","item_ring_of_minor_mana","item_ring_of_monk","item_ring_of_poison_reistance","item_ring_of_ranger_guard","item_ring_of_scarlet_wounds","item_ring_of_seeing","item_ring_of_striking","item_ring_of_whisper","item_ring_of_wind","item_ring_of_wisdom","item_ring_spell_focus","item_robe_tattered","item_runeguard_tunic","item_rusty_dagger","item_rusty_flail","item_rusty_sword","item_shaman_wrap","item_shield_knight","item_shield_moonsteel","item_shield_of_arrowcatcher","item_shield_of_lethander","item_shield_of_protection","item_shield_of_wind","item_short_sword","item_shortbow","item_skyshot_bracers","item_sling","item_sling_thunder","item_soulforge_axe","item_spear","item_spear_ice","item_staff_01","item_staff_02","item_staff_minor_magic","item_staff_of_archmage","item_staff_of_fireball","item_staff_of_ice_crystals","item_staff_of_sleeper","item_staff_of_stars","item_staff_of_the_thunder","item_sword","item_sword_04","item_sword_claymore","item_sword_edge_of_path","item_sword_embersand_saber","item_sword_frostbite_edge","item_sword_gravewrought","item_sword_kingbreaker","item_sword_longsword","item_sword_oath_of_bastion","item_sword_of_striking","item_sword_rusty_longsword","item_sword_shardpiercer","item_sword_stormcleaver","item_sword_void","item_wooden_shield","skill_arcane_flight","skill_arcane_lock","skill_aura_of_blades","skill_aura_of_the_void","skill_aura_of_thorns","skill_backstab_the_weak","skill_barbed_arrows","skill_battle_roar","skill_bleeding_dash","skill_blood_lance","skill_blood_pact","skill_bloodfall","skill_champions_grip","skill_cleave","skill_cloak_of_swiftness","skill_consecrated_ground","skill_crimson_renewal","skill_deadly_shot","skill_divine_guard","skill_dragon_arcana","skill_evasive_roll","skill_execution_shot","skill_exsanguinate","skill_fade_into_nothingness","skill_feel_the_flow","skill_fire_spark","skill_fireball","skill_flame_of_conviction","skill_flow_of_life","skill_flurry_thrust","skill_hunters_prey","skill_ice_shard","skill_ice_tower","skill_invisibility","skill_judgment","skill_lay_on_hands","skill_leechcraft","skill_mark_the_dead","skill_nightshade_mastery","skill_null_bolt","skill_omen_of_the_veins","skill_power_of_the_void","skill_provoking_shout","skill_quickshot","skill_righteous_strike","skill_riposte","skill_sacred_bulwark","skill_scarlet_shackles","skill_shadow_instinct","skill_shadow_lunge","skill_shield_bash","skill_shielding_barrier","skill_skirmishers_step","skill_skull_rattle","skill_slice_and_dice","skill_smoke_bomb","skill_static_shock","skill_stillstrike","skill_storm_chain","skill_stun_undead","skill_take_aim","skill_unholy_convergence","skill_void_mend","skill_zealous_resolve","item_bones3","item_caerlin_blue_flowers","item_coins1","item_empty_flask","item_flower_amberrose","item_flower_crimson_berries","item_flower_moonpetal","item_flower_solarbloom","item_food_bread","item_food_cheese","item_food_ham","item_ingredient_ectoplasm","item_ingredient_mandibles","item_mimic_heart","item_moonsteel_ore","item_mushroom_red","item_mushroom_yellow","item_spider_eye","item_venom_sac","item_voidshard","hud_symbol_trait_mutation_negative","hud_symbol_trait_mutation_positive","item_animal_skull","item_apple","item_axe_doomhowl","item_barlo_doll","item_beer","item_black_feather","item_bones1","item_bones2","item_bones4","item_bones5","item_bones6","item_book_blackwood_1","item_book_guardian_1","item_book_guardian_2","item_book_guardian_4","item_boulder","item_dagger2","item_darou_hairbrush","item_diamond_blue","item_diamond_green","item_diamond_orange","item_diamond_purple","item_diamond_red","item_empty_djinn","item_eye","item_food_bread_moldy","item_food_leftover","item_food_ration","item_food_worm_slice","item_generic_arrow","item_generic_ash","item_generic_ash_giant","item_generic_beer_bottle","item_generic_broken_dagger","item_generic_charcoal","item_generic_dusty_apple","item_generic_giant_finger","item_generic_golden_tooth_of_rat_king","item_generic_iron_needle","item_generic_jar_of_mud","item_generic_metal_button","item_generic_mouse","item_generic_nails","item_generic_old_coin","item_generic_scam_wand","item_generic_sooth_cloth","item_generic_tiny_coffin","item_generic_tooth","item_generic_twig_cross","item_gold_chisel","item_golden_ore","item_grgla_fish","item_key_01","item_key_02","item_key_bronze","item_key_gold","item_key_iron","item_key_iron_moss","item_key_iron_moss2","item_key_silver","item_lockpicks","item_mercy_feather","item_mortar","item_mushroom_blue","item_mushroom_brown","item_mushroom_ear","item_mushroom_green","item_mushroom_reddish","item_orb_blue","item_pickaxe","item_pickaxe2","item_potion_heal_large","item_recipe","item_scroll_blood","item_scroll_yellow","item_shovel","item_spirit_lantern","item_sporeheart_cluster","item_teleport_stone","item_torren_tincture","item_underkeep_key_1","item_underkeep_key_2","item_underkeep_key_3","item_underkeep_key_4","item_white_feather","item_wild_berries","item_wolf_head","item_wolf_tooth","hud_symbol_poison","hud_symbol_bleed","hud_symbol_burn","hud_symbol_freeze","hud_symbol_blind","hud_symbol_paralyze","hud_symbol_stun","hud_symbol_disease","hud_symbol_unskilled","hud_symbol_ooze_corrosion","item_potion_respec","skill_cloak_of_shadow"],
"iconRects": [[0,0,60,70],[60,0,60,70],[120,0,60,70],[180,0,60,70],[240,0,60,70],[300,0,60,70],[360,0,25,25,12,12],[385,0,24,23,12,11],[409,0,24,23,12,11],[433,0,24,25,11,12],[457,0,24,25,11,12],[481,0,24,25,11,12],[505,0,26,24,12,12],[531,0,24,24,12,12],[555,0,24,24,11,12],[579,0,24,25,11,12],[603,0,22,23,10,11],[625,0,24,25,11,12],[649,0,22,23,10,11],[671,0,25,25,12,12],[696,0,25,25,12,12],[721,0,25,25,12,12],[0,70,25,25,12,12],[25,70,25,25,12,12],[50,70,26,25,12,12],[76,70,25,25,12,12],[101,70,25,25,12,12],[126,70,17,37,8,10],[143,70,20,38,10,11],[163,70,20,36,10,10],[183,70,17,37,8,10],[200,70,24,37,14,10],[224,70,24,37,14,10],[248,70,17,37,8,10],[265,70,24,40,11,13],[289,70,24,37,11,10],[313,70,29,44,14,13],[342,70,25,25,12,12],[367,70,25,24,12,11],[392,70,24,25,11,12],[416,70,26,18,12,8],[442,70,24,23,11,10],[466,70,24,18,11,8],[490,70,24,18,11,8],[514,70,22,25,11,12],[536,70,24,26,12,12],[560,70,24,26,12,12],[584,70,25,25,12,12],[609,70,25,25,12,12],[634,70,25,25,12,12],[659,70,25,25,12,12],[684,70,25,25,12,12],[709,70,25,21,12,10],[734,70,25,25,12,12],[0,114,25,25,12,12],[25,114,25,25,12,12],[50,114,23,23,11,11],[73,114,25,25,12,12],[98,114,21,20,10,10],[119,114,31,35,17,14],[150,114,25,25,12,12],[175,114,25,22,12,9],[200,114,25,25,12,12],[225,114,25,25,12,12],[250,114,25,25,12,12],[275,114,25,25,12,12],[300,114,25,25,12,12],[325,114,25,25,12,12],[350,114,24,22,11,10],[374,114,25,25,12,12],[399,114,25,25,11,11],[424,114,25,25,12,12],[449,114,25,25,12,12],[474,114,32,34,20,11],[506,114,32,35,20,12],[538,114,32,35,20,12],[570,114,24,21,12,10],[594,114,32,32,13,13],[626,114,31,31,12,12],[657,114,21,23,10,11],[678,114,24,24,11,11],[702,114,17,26,9,13],[719,114,27,27,13,13],[746,114,20,22,9,11],[0,149,25,22,13,10],[25,149,19,22,9,11],[44,149,21,34,10,13],[65,149,23,24,10,11],[88,149,28,34,14,11],[116,149,25,24,11,12],[141,149,25,24,12,11],[166,149,25,25,12,12],[191,149,25,25,12,12],[216,149,23,23,11,12],[239,149,30,22,18,10],[269,149,25,18,12,9],[294,149,23,15,10,7],[317,149,24,19,12,9],[341,149,21,23,11,11],[362,149,17,13,8,5],[379,149,22,25,12,12],[401,149,25,25,12,12],[426,149,25,24,12,11],[451,149,26,24,12,11],[477,149,25,24,12,11],[502,149,25,25,12,12],[527,149,25,25,12,12],[552,149,25,25,12,12],[577,149,25,24,12,11],[602,149,26,24,12,11],[628,149,25,24,12,11],[653,149,26,24,12,11],[679,149,25,25,12,12],[704,149,25,25,12,12],[729,149,23,22,11,11],[0,183,25,19,12,9],[25,183,26,25,13,12],[51,183,25,25,12,12],[76,183,25,25,12,12],[101,183,23,25,11,13],[124,183,26,26,12,12],[150,183,21,22,10,10],[171,183,21,15,10,7],[192,183,23,16,11,7],[215,183,22,25,12,11],[237,183,22,25,9,12],[259,183,23,25,11,12],[282,183,23,25,11,12],[305,183,21,25,9,12],[326,183,21,24,10,12],[347,183,21,24,10,12],[368,183,26,26,12,13],[394,183,25,25,12,12],[419,183,20,24,10,12],[439,183,17,37,8,10],[456,183,24,22,11,10],[480,183,28,28,14,13],[508,183,28,28,14,13],[536,183,23,23,11,11],[559,183,27,29,13,14],[586,183,34,37,22,12],[620,183,33,32,19,14],[653,183,36,35,21,12],[689,183,37,39,24,12],[726,183,25,25,12,11],[0,222,22,22,10,10],[22,222,35,34,22,12],[57,222,25,24,12,11],[82,222,25,25,12,12],[107,222,14,25,7,11],[121,222,18,24,8,12],[139,222,18,22,8,10],[157,222,12,24,5,11],[169,222,22,28,10,11],[191,222,14,24,6,11],[205,222,18,24,8,11],[223,222,13,24,6,11],[236,222,23,27,10,11],[259,222,13,27,6,11],[272,222,23,27,11,11],[295,222,13,24,6,11],[308,222,14,24,6,11],[322,222,14,26,7,12],[336,222,14,24,6,11],[350,222,9,23,4,10],[359,222,14,25,6,12],[373,222,23,25,11,12],[396,222,18,26,9,13],[414,222,23,24,11,11],[437,222,19,20,8,9],[456,222,25,23,13,12],[481,222,22,22,10,10],[503,222,20,20,10,10],[523,222,23,22,11,11],[546,222,25,23,13,12],[571,222,20,19,10,8],[591,222,17,14,8,6],[608,222,25,25,13,12],[633,222,25,22,12,10],[658,222,24,21,11,10],[682,222,20,21,9,10],[702,222,25,28,12,16],[727,222,20,20,9,9],[0,256,25,23,12,11],[25,256,19,19,9,9],[44,256,18,18,9,9],[62,256,25,26,12,12],[87,256,25,22,12,11],[112,256,25,22,12,11],[137,256,20,20,10,10],[157,256,25,23,13,12],[182,256,25,23,13,12],[207,256,25,25,12,12],[232,256,25,25,12,12],[257,256,21,23,10,11],[278,256,30,22,18,10],[308,256,35,35,23,11],[343,256,25,25,12,12],[368,256,23,25,11,12],[391,256,23,23,11,11],[414,256,20,23,10,11],[434,256,20,23,10,11],[454,256,25,25,12,12],[479,256,25,25,12,12],[504,256,35,35,23,11],[539,256,26,26,12,12],[565,256,23,23,11,11],[588,256,23,32,11,10],[611,256,24,35,12,13],[635,256,27,53,13,13],[662,256,46,46,33,12],[708,256,48,48,35,12],[0,309,53,52,41,10],[53,309,52,52,41,10],[105,309,53,54,41,12],[158,309,29,97,16,16],[187,309,56,56,41,14],[243,309,52,52,41,10],[295,309,52,53,39,12],[347,309,25,25,12,12],[372,309,54,54,41,12],[426,309,35,35,23,11],[461,309,24,28,11,14],[485,309,48,48,35,12],[533,309,45,45,31,13],[578,309,39,36,26,12],[617,309,36,35,23,12],[653,309,36,36,23,12],[689,309,45,46,32,12],[0,406,35,35,23,11],[35,406,39,40,26,11],[74,406,35,35,21,13],[109,406,35,35,23,11],[144,406,36,37,22,12],[180,406,35,35,21,13],[215,406,41,41,28,12],[256,406,21,21,10,10],[277,406,27,25],[304,406,29,28],[333,406,26,26],[359,406,26,24],[385,406,26,27],[411,406,26,27],[437,406,29,29],[466,406,26,29],[492,406,26,23],[518,406,25,24],[543,406,27,25],[570,406,28,28],[598,406,26,29],[624,406,30,27],[654,406,29,29],[683,406,29,26],[712,406,21,25],[733,406,27,27],[0,447,24,25],[24,447,26,25],[50,447,25,28],[75,447,28,28],[103,447,29,29],[132,447,27,26],[159,447,29,28],[188,447,23,26],[211,447,24,27],[235,447,28,27],[263,447,27,28],[290,447,30,27],[320,447,27,27],[347,447,26,26],[373,447,27,26],[400,447,17,27],[417,447,30,26],[447,447,24,29],[471,447,27,27],[498,447,19,24],[517,447,36,30],[553,447,26,25],[579,447,25,27],[604,447,27,28],[631,447,29,30],[660,447,25,30],[685,447,24,29],[709,447,26,26],[735,447,26,24],[0,477,24,26],[24,477,27,27],[51,477,29,28],[80,477,27,27],[107,477,22,24],[129,477,30,29],[159,477,28,29],[187,477,30,28],[217,477,29,29],[246,477,27,28],[273,477,29,29],[302,477,25,26],[327,477,26,28],[353,477,28,28],[381,477,29,28],[410,477,24,25],[434,477,26,25],[460,477,19,24,8,11],[479,477,22,20,11,10],[501,477,7,5,3,3],[508,477,13,24,6,11],[521,477,22,22,11,10],[543,477,24,22,12,10],[567,477,20,15,9,6],[587,477,21,16,9,8],[608,477,21,19,10,9],[629,477,20,18,9,9],[649,477,26,21,12,9],[675,477,25,24,12,12],[700,477,18,21,7,10],[718,477,25,24,12,11],[743,477,22,20,10,9],[0,506,18,21,9,11],[18,506,20,21,10,10],[38,506,22,16,11,9],[60,506,22,13,9,4],[82,506,22,18,11,9],[104,506,15,14],[119,506,15,14],[134,506,20,32,10,17],[154,506,21,23,9,11],[175,506,29,43,14,14],[204,506,23,28,11,13],[227,506,23,24,11,11],[250,506,24,24,12,11],[274,506,25,10,12,5],[299,506,18,18,8,9],[317,506,17,13,8,6],[334,506,18,20,9,9],[352,506,24,21,12,10],[376,506,23,24,11,11],[399,506,25,25,12,12],[424,506,25,25,12,12],[449,506,25,25,12,12],[474,506,13,12,6,7],[487,506,17,26,9,13],[504,506,25,23,12,11],[529,506,21,17,10,7],[550,506,21,21,9,10],[571,506,18,23,8,11],[589,506,25,17,12,9],[614,506,24,21,11,9],[638,506,15,22,7,11],[653,506,27,24,14,10],[680,506,21,19,10,9],[701,506,26,23,12,10],[727,506,24,18,11,7],[0,549,21,20,9,10],[21,549,28,28,14,14],[49,549,19,12,9,5],[68,549,22,13,10,6],[90,549,9,23,4,11],[99,549,24,22,12,10],[123,549,21,20,11,10],[144,549,17,23,7,11],[161,549,26,25,13,12],[187,549,13,23,5,11],[200,549,21,21,9,9],[221,549,17,22,7,10],[238,549,18,18,8,9],[256,549,13,24,5,10],[269,549,20,21,9,10],[289,549,20,13,9,6],[309,549,21,25,8,12],[330,549,24,21,12,10],[354,549,15,22,7,11],[369,549,24,24,11,11],[393,549,20,24,10,12],[413,549,21,21,9,9],[434,549,25,22,12,10],[459,549,18,22,8,10],[477,549,24,27,12,13],[501,549,24,27,12,13],[525,549,20,22,9,10],[545,549,20,20,12,9],[565,549,18,20,8,10],[583,549,18,20,8,10],[601,549,18,20,8,10],[619,549,20,22,9,11],[639,549,25,24,12,11],[664,549,31,31,19,18],[695,549,23,25,11,12],[718,549,21,21,10,10],[739,549,21,21,9,10],[0,580,21,21,10,10],[21,580,20,21,10,10],[41,580,18,21,9,10],[59,580,22,21,10,10],[81,580,25,25,12,12],[106,580,25,25,12,12],[131,580,14,25,6,12],[145,580,23,24,11,11],[168,580,23,22,12,11],[191,580,23,22,12,11],[214,580,25,25,12,12],[239,580,14,25,6,12],[253,580,20,17,10,8],[273,580,32,32,16,15],[305,580,12,24,5,11],[317,580,19,19,9,9],[336,580,19,19,9,9],[355,580,19,19,9,9],[374,580,19,19,9,9],[393,580,24,24,12,11],[417,580,23,11,11,4],[440,580,19,19,9,9],[459,580,12,24,5,11],[0,612,18,14],[18,612,12,14],[30,612,13,14],[43,612,16,14],[59,612,15,14],[74,612,15,14],[89,612,15,14],[104,612,15,14],[119,612,15,14],[134,612,15,14],[0,626,18,26],[18,626,24,38]],
"inventoryIconFrames": {"item_axe_01":[126,70,17,26],"item_axe_02":[143,70,20,26],"item_axe_03":[163,70,20,26],"item_axe_04":[183,70,17,26],"item_axe_05":[200,70,24,26],"item_axe_06":[224,70,24,26],"item_axe_07":[248,70,17,26],"item_axe_08":[265,70,24,26,0,1,24,25],"item_axe_09":[289,70,24,26],"item_axe_campbreaker":[316,70,26,26],"item_butchers_hook":[124,114,26,26],"item_club_01":[480,114,26,26],"item_club_02":[512,114,26,26],"item_club_03":[544,114,26,26],"item_crossbow_heavy":[600,114,23,26],"item_crossbow_light":[631,114,24,26],"item_dagger_nightsting":[720,114,26,26],"item_duroks_promise":[90,149,26,26],"item_flail":[243,149,26,22],"item_jacob_axe":[439,183,17,26],"item_longbow":[482,183,26,26],"item_longbow_gravecaller":[510,183,26,26],"item_longbow_of_striking":[560,183,26,26],"item_mace":[594,183,26,26],"item_mace_gravecleft":[627,183,26,26],"item_mace_of_staggering_blow":[663,183,26,26],"item_mace_of_stars":[700,183,26,26],"item_maul":[31,222,26,26],"item_rusty_flail":[282,256,26,22],"item_rusty_sword":[317,256,26,26],"item_short_sword":[513,256,26,26],"item_sling":[588,256,23,26],"item_sling_thunder":[611,256,24,26,1,1,23,25],"item_soulforge_axe":[636,256,26,26],"item_spear":[682,256,26,26],"item_spear_ice":[730,256,26,26],"item_staff_01":[27,309,26,26],"item_staff_02":[79,309,26,26],"item_staff_minor_magic":[132,309,26,26],"item_staff_of_archmage":[162,309,25,26],"item_staff_of_fireball":[217,309,26,26,0,4,21,22],"item_staff_of_ice_crystals":[269,309,26,26],"item_staff_of_sleeper":[321,309,26,26],"item_staff_of_the_thunder":[400,309,26,26],"item_sword":[435,309,26,26],"item_sword_04":[461,309,24,26],"item_sword_claymore":[507,309,26,26],"item_sword_edge_of_path":[552,309,26,26],"item_sword_embersand_saber":[591,309,26,26],"item_sword_frostbite_edge":[627,309,26,26],"item_sword_gravewrought":[663,309,26,26],"item_sword_kingbreaker":[708,309,26,26],"item_sword_longsword":[9,406,26,26],"item_sword_oath_of_bastion":[48,406,26,26],"item_sword_of_striking":[83,406,26,26],"item_sword_rusty_longsword":[118,406,26,26],"item_sword_shardpiercer":[154,406,26,26],"item_sword_stormcleaver":[189,406,26,26],"item_sword_void":[230,406,26,26],"item_axe_doomhowl":[178,506,26,26],"item_potion_heal_and_mana":[169,222,22,28,3,0,16,26],"item_potion_mana_medium":[236,222,23,27,2,0,19,25],"item_potion_mana_small":[259,222,13,27,2,0,9,25],"item_potion_mana_up":[272,222,23,27,2,0,19,25],"item_ring_of_minor_mana":[702,222,25,28,2,3,20,25],"item_ingredient_ectoplasm":[675,477,25,24,3,3,19,18],"item_mercy_feather":[664,549,31,31,4,4,27,27],"item_teleport_stone":[273,580,32,32,4,3,24,25]},
"mapIds": ["Abandoned_Mines_Cave","Basilisk_Den","Blackwood","Caerlin_West_Dungeon","Caerlin_Woods","Dragon_den","East_Garden","Forgotten_Vein","Mausoleum","Mausoleum_2","Mausoleum_3","Mausoleum_3_2","Mines_under_forest","Rat_nest","Small_spider_cave","Starting_forest","Surroundings_Cave","Swamp","Swamp_Dungeon1","Swamp_Dungeon2","Swamp_Lost_City","Swamp_Spider_Nest","Tower_Level1","Tower_Level2","Tower_Level2_Corrupted","Tower_Level3","Tower_Level4","Tower_Level5","Under_Abandoned_Cave","Underkeep_Cemetery","Underkeep_Surroundings","Undertower","Village_of_Underkeep","West_Dungeon_1","West_Dungeon_2","West_Dungeon_3","West_Garden","West_woods","Wolf_den"],
"effectRects": {"hud_symbol_poison":[0,0,18,14],"hud_symbol_burn":[18,0,13,14],"hud_symbol_freeze":[36,0,16,14],"hud_symbol_bleed":[54,0,12,14],"hud_symbol_stun":[72,0,15,14],"hud_symbol_blind":[90,0,15,14],"hud_symbol_paralyze":[108,0,15,14],"hud_symbol_hunters_prey":[126,0,15,14],"hud_symbol_mark_the_dead":[0,14,15,14],"hud_symbol_blood_pact":[18,14,15,14],"hud_symbol_unholy_convergence":[36,14,15,14],"hud_symbol_zerethic_regeneration":[54,14,15,14],"hud_symbol_void_shard_effect":[72,14,15,14],"hud_symbol_health_regeneration":[90,14,15,14],"hud_symbol_disease":[108,14,15,14],"hud_symbol_bonus_armor":[126,14,15,14],"hud_symbol_paladin_divine_guard":[0,28,15,14],"hud_symbol_bonus_evasion":[18,28,15,14],"hud_symbol_bonus_elemental_resistance":[36,28,15,14],"hud_symbol_permanent_mana_up":[54,28,15,14],"hud_symbol_dwarf_beer_bonus":[72,28,15,14],"hud_symbol_muddy":[90,28,15,14],"hud_symbol_mushroom_disease":[108,28,15,14],"hud_symbol_unskilled":[126,28,15,14],"hud_symbol_ooze_corrosion":[0,42,15,14],"hud_symbol_shielding_barrier":[18,42,15,14],"hud_symbol_void_veil":[36,42,15,14],"hud_symbol_provoking_shout":[54,42,15,14],"hud_symbol_battle_roar":[72,42,15,14],"hud_symbol_champions_grip":[90,42,15,14],"hud_symbol_riposte_stance":[108,42,15,14],"hud_symbol_evasive_roll":[126,42,15,14],"hud_symbol_consecrated_ground":[0,56,15,14],"hud_symbol_skirmishers_step":[18,56,15,14],"hud_symbol_invisibility":[36,56,15,14],"hud_symbol_aura_of_blades":[54,56,15,14],"hud_symbol_aura_of_the_void":[72,56,15,14],"hud_symbol_aura_of_thorns":[90,56,15,14],"hud_symbol_status_mark_of_the_frog":[108,56,15,14],"hud_symbol_status_saps_endurance":[126,56,15,14],"hud_symbol_status_shades_shelter":[0,70,15,14],"hud_symbol_status_blessing_of_the_wolf_queen":[18,70,15,14],"hud_symbol_trait_armor_vs_animals":[36,70,15,14],"hud_symbol_trait_more_exp":[54,70,15,14],"hud_symbol_trait_deep_sight":[72,70,15,14],"hud_symbol_trait_infravision":[90,70,15,14],"hud_symbol_trait_eye_stalks":[108,70,15,14],"hud_symbol_trait_stonebound":[126,70,15,14],"hud_symbol_trait_twisted_blood":[0,84,15,14],"hud_symbol_trait_mutation_positive":[18,84,15,14],"hud_symbol_trait_mutation_negative":[36,84,15,14],"hud_symbol_undead":[54,84,15,14],"hud_symbol_demon":[72,84,15,14],"hud_symbol_animal":[90,84,15,14],"hud_symbol_armor":[108,84,17,14]}
};
  const iconIndex = new Map(guide.icons.map((name, i) => [name, i]));
  const itemsById = new Map();
  const enemiesById = new Map();

  function addData(data) {
    Object.assign(guide, data);
    data.items?.forEach(item => itemsById.set(item.id, item));
    data.enemies?.forEach(enemy => enemiesById.set(enemy.id, enemy));
  }

  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }

  function spriteIcon([x, y, width, height], className) {
    const el = node('span', '', className);
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {width: width + 'px', height: height + 'px', backgroundPosition: -x + 'px ' + -y + 'px'});
    return el;
  }

  function icon(name) {
    return spriteIcon(guide.iconRects[iconIndex.get(name)], 'icon');
  }

  function coinPrice(value, tag = 'span') {
    const amount = node(tag, value, 'coin-price');
    const coin = spriteIcon(guide.iconRects[iconIndex.get('item_coins1')], 'price-coin');
    coin.removeAttribute('aria-hidden');
    coin.setAttribute('role', 'img');
    coin.setAttribute('aria-label', '金幣');
    amount.append(coin);
    return amount;
  }

  function inventoryIcon(name) {
    const index = iconIndex.get(name);
    // Weapon frames retain the game's top-right inventory crop at native scale.
    const frame = guide.inventoryIconFrames?.[name];
    const rect = frame ?? guide.iconRects[index];
    const [, , width, height] = rect;
    // Low-opacity glow pixels can extend beyond the visible silhouette.
    const [left = 0, top = 0, visibleWidth = width, visibleHeight = height] = frame?.slice(4) ?? [];
    const slotSize = 26;
    const scale = Math.min(1, slotSize / Math.max(visibleWidth, visibleHeight));
    const slot = node('span', undefined, 'inventory-icon');
    const art = spriteIcon(rect, 'inventory-art');
    art.style.left = (slotSize / 2 - (left + visibleWidth / 2) * scale) + 'px';
    art.style.top = (slotSize / 2 - (top + visibleHeight / 2) * scale) + 'px';
    if (scale < 1) art.style.transform = `scale(${scale})`;
    slot.setAttribute('aria-hidden', 'true');
    slot.append(art);
    return slot;
  }

  function route(group, entry) {
    return '#' + group + (entry ? '/' + entry.id : '');
  }

  function placeLabel(mid, id) {
    const place = guide.places[mid];
    if (Array.isArray(id)) return [place.name, '（' + id.join(', ') + '）'];
    const [title, xy] = place.points[id];
    return [place.name + ' · ' + title, '（' + xy.join(', ') + '）'];
  }

  function sources(parent, r, title, sourceRoute, { guideUrl = '', mapHref, detailButton, acquisition = false } = {}) {
    const locationHref = mapHref || ((mid, id) => '?view=map&guide=' + encodeURIComponent(sourceRoute.slice(1)) + '#' + mid + '@' + id);
    const article = acquisition ? node('details', undefined, 'acquisition') : parent;
    if (acquisition) parent.append(article);
    if (title) article.append(node(acquisition ? 'summary' : 'h3', title));
    if (!r.sources?.length && !r.enemyDrops?.length) {
      article.append(node('p', '—', 'muted'));
      return article;
    }
    const groups = new Map();
    for (const [how, mid, id] of r.sources) {
      if (!groups.has(how)) groups.set(how, []);
      groups.get(how).push([mid, id]);
    }
    for (const [how, entries] of groups) {
      if (entries.every(([mid]) => !mid)) {
        article.append(node('p', how));
        continue;
      }
      const locations = node('div', undefined, 'locations');
      for (const [mid, id] of entries) {
        const [name] = placeLabel(mid, id);
        const link = node('a', name);
        link.href = locationHref(mid, id);
        locations.append(link);
      }
      if (how === title) article.append(locations);
      else {
        const details = node('details');
        details.dataset.method = how;
        details.open = !acquisition && entries.length <= 5;
        details.append(node('summary', how), locations);
        article.append(details);
      }
    }
    if (r.enemyDrops?.length) {
      const details = node('details');
      details.dataset.method = '敵人掉落';
      details.open = !acquisition && r.enemyDrops.length <= 5;
      details.append(node('summary', '敵人掉落'));
      const links = node('div', undefined, 'locations');
      for (const [id, methods] of r.enemyDrops) {
        const enemy = enemiesById.get(id);
        const link = detailButton ? detailButton(enemy) : node('a', enemy.name);
        if (!detailButton) link.href = guideUrl + route('enemies', enemy);
        if (methods.length > 1 || methods[0] !== '擊敗敵人') link.append(' · ' + methods.join('、'));
        links.append(link);
      }
      details.append(links);
      article.append(details);
    }
    return article;
  }

  function entryLinks(article, title, group, records, { showIcons = false, guideUrl = '', detailButton, price } = {}) {
    if (title) article.append(node('h3', title));
    const links = node('div', undefined, 'links');
    for (const r of records) {
      const label = r.name + (r.unlock ? ' · Lv.' + r.unlock : '');
      const link = group === 'items' && detailButton ? detailButton(r, label) : node('a', label);
      if (link.tagName === 'A') link.href = guideUrl + route(group, r);
      if (showIcons) link.prepend(group === 'items' ? inventoryIcon(r.icon) : icon(r.icon));
      if (price) link.append(coinPrice(price(r)));
      links.append(link);
    }
    article.append(links);
  }

  function heading(title, english, image, head = node('div', undefined, 'entry-heading')) {
    const names = node('div', undefined, 'entry-names');
    names.append(node('h2', title), node('small', english));
    head.replaceChildren(names);
    if (image) head.prepend(image);
    return head;
  }

  function facts(rows, className = 'facts') {
    const dl = node('dl', undefined, className);
    for (const [key, value, valueClass, rowClass] of rows) {
      const pair = node('div', undefined, rowClass);
      const description = node('dd', value, valueClass);
      if (key === '經驗值') description.replaceChildren(underkeepXp(Number(value)));
      if (key === '經驗') description.replaceChildren(underkeepXp(value, false));
      pair.append(node('dt', key), description);
      dl.append(pair);
    }
    return dl;
  }

  function catalogHeading(r, image, container, badge) {
    const head = heading(r.name, r.english, image, container);
    const title = head.querySelector('h2');
    if (itemsById.get(r.id) === r) {
      const properties = new Map(r.facts);
      const category = node('div', undefined, 'item-category');
      category.append(node('span', properties.get('武器類型') || r.group));
      const badges = node('span', undefined, 'item-category-badges');
      const symbols = [];
      if (properties.get('持用方式') === '雙手') symbols.push([0, '雙手持用']);
      if (properties.get('攻擊距離') === '長柄攻擊') symbols.push([1, '長柄攻擊']);
      for (const [frame, label] of symbols) {
        const symbol = staffIcon(frame);
        symbol.title = label;
        symbol.setAttribute('role', 'img');
        symbol.setAttribute('aria-label', label);
        badges.append(symbol);
      }
      if (badge) badges.append(badge);
      if (badges.childElementCount) category.append(badges);
      head.querySelector('.entry-names').append(category);
    } else if (badge) {
      const row = node('div', undefined, 'item-title-row');
      title.replaceWith(row);
      row.append(title, badge);
    }
  }

  function statColor(amount) {
    if (amount > 0) return 'stat-positive';
    if (amount < 0) return 'stat-negative';
  }

  function staffIcon(frame) {
    const sprite = node('span', undefined, 'staff-icon');
    sprite.style.backgroundPositionX = (-28 * frame) + 'px';
    return sprite;
  }

  function itemSkill(name, skill) {
    const section = node('section', undefined, 'granted-skill');
    const header = node('div', undefined, 'granted-skill-heading');
    const icon = staffIcon(skill.frame);
    icon.setAttribute('aria-hidden', 'true');
    const names = node('div');
    names.append(node('h3', name), node('p', '（技能）', 'granted-skill-type'));
    header.append(icon, names);
    const rows = skill.facts.map(([label, value]) =>
      label === '冷卻' ? [label, value, 'skill-cooldown'] : itemFactRow([label, value]));
    section.append(header, node('p', skill.description, 'granted-skill-description'), facts(rows, 'item-attributes'));
    return section;
  }

  function itemFactRow([label, value]) {
    if (['基礎傷害', '鋒利度', '護甲穿透'].includes(label)) return [label, value, undefined, 'damage-detail'];
    if (label.startsWith('恢復')) return [label, value, undefined, 'item-recovery'];
    const element = /^(?:火焰|燃燒|冰霜|凍結|閃電|虛空|毒素|中毒|血魔法)/.exec(label)?.[0];
    const damageStyle = {
      火焰: 'item-fire', 燃燒: 'item-fire', 冰霜: 'item-ice', 凍結: 'item-ice', 閃電: 'item-lightning',
      虛空: 'item-void', 毒素: 'item-poison', 中毒: 'item-poison', 血魔法: 'item-blood'
    }[element];
    const bonus = ['閃避', '護甲', '力量', '敏捷', '智慧', '法力', '生命', '近戰防護', '遠程防護',
      '遠程傷害', '徒手傷害', '經驗'].includes(label) || /(?:抗性|命中率|法術傷害)$/.test(label);
    if (bonus && /^[+-]?\d+%?$/.test(value)) {
      const amount = Number.parseInt(value, 10);
      const unit = label === '閃避' || value.endsWith('%') ? '%' : '';
      value = (amount > 0 ? '+' : '') + amount + unit;
    }
    return [label, value, undefined, label === '經驗' ? 'item-feature' : damageStyle];
  }

  function itemSheet(r, detailRoute, options) {
    const sheet = node('section', undefined, 'item-detail item-sheet');
    const attributes = [];
    const requirements = [];
    const immunities = node('ul', undefined, 'item-effects');
    const effects = node('ul', undefined, 'item-effects');
    let salePrice;
    let skill;
    for (const [label, value, effectStyle] of r.facts) {
      if (label === '任務物品' || label === '武器類型' || (label === '持用方式' && value === '雙手') ||
        (label === '攻擊距離' && value === '長柄攻擊')) continue;
      if (label === '附帶技能' && r.grantedSkill) {
        skill = itemSkill(value, r.grantedSkill);
      } else if (label.startsWith('免疫') && (value === '1' || value === '0')) {
        if (value === '1') immunities.append(node('li', label));
      } else if (label === '特殊效果' || label === '效果') {
        effects.append(node('li', value, effectStyle));
      } else if (label.startsWith('需求') || label === '限定職業') {
        requirements.push([label, value]);
      } else if (label === '賣價') {
        salePrice = value;
      } else if (label !== '買價') {
        attributes.push(itemFactRow([label, value]));
      }
    }
    if (attributes.length) sheet.append(facts(attributes, 'item-attributes'));
    if (immunities.childElementCount) sheet.append(immunities);
    if (requirements.length) sheet.append(facts(requirements, 'item-attributes'));
    if (effects.childElementCount) {
      effects.setAttribute('aria-label', '特殊效果');
      sheet.append(effects);
    }
    if (r.hiddenEffects?.length) {
      const list = node('ul', undefined, 'item-hidden-effects');
      list.setAttribute('aria-label', '額外效果');
      for (const text of r.hiddenEffects) {
        const effect = node('li');
        effect.append(underkeepXpText(text));
        list.append(effect);
      }
      sheet.append(list);
    }
    if (r.intro) sheet.append(node('p', r.intro, 'intro'));
    if (skill) sheet.append(skill);
    if (salePrice !== undefined) {
      const footer = node('div', undefined, 'item-sale-price');
      footer.append(coinPrice(salePrice));
      sheet.append(footer);
    }
    const materialRecipes = guide.recipes.filter(recipe => recipe.ingredients.some(([name]) => guide.ingredientIds[name] === r.id));
    if (r.uses?.length || materialRecipes.length) {
      const usage = node('section', undefined, 'item-uses');
      if (r.uses?.length) sources(usage, { sources: r.uses }, '', detailRoute, options);
      if (materialRecipes.length) entryLinks(usage, '使用此材料的配方', 'recipes', materialRecipes, options);
      sheet.append(usage);
    }
    const acquisition = sources(sheet, r, '取得方式與地點', detailRoute, { ...options, acquisition: true });
    const recipes = guide.recipes.filter(recipe => recipe.productId === r.id || recipe.id === r.recipeId);
    if (recipes.length) entryLinks(acquisition, '合成表', 'recipes', recipes, options);
    const merchants = guide.shops.filter(shop => shop.stock.some(([id]) => id === r.id));
    if (merchants.length) entryLinks(acquisition, '販售商店', 'shops', merchants, {
      ...options, price: shop => shop.stock.find(([id]) => id === r.id)[1]
    });
    return sheet;
  }

  function itemBadge(r) {
    const isQuestItem = r.facts.some(([label, value]) => label === '任務物品' && value === '1');
    return isQuestItem ? node('span', '任務物品', 'quest-item-badge') : null;
  }

  function questSheet(r, detailRoute, options) {
    const sheet = node('section', undefined, 'item-detail quest-detail');
    if (r.steps?.length) {
      const steps = node('ol', undefined, 'quest-steps');
      for (const step of r.steps) steps.append(node('li', step));
      sheet.append(node('h3', '任務解法'), steps);
    }
    for (const [label, value] of r.facts) sheet.append(node('h3', label), node('p', value));
    if (r.endingIds?.length) {
      const endings = node('ul', undefined, 'quest-endings');
      for (const id of r.endingIds) {
        const { name, condition } = guide.endings[id];
        const row = node('li');
        row.append(node('strong', name), node('p', condition));
        endings.append(row);
      }
      sheet.append(node('h3', '遊戲結局與觸發條件'), endings);
      if (r.endingNotes?.length) {
        sheet.append(node('h3', '路線提示'));
        for (const note of r.endingNotes) sheet.append(node('p', note, 'quest-ending-note'));
      }
    }
    const itemOptions = { ...options, showIcons: true };
    if (r.rewards?.length) {
      const rewards = node('ul', undefined, 'quest-rewards');
      for (const { stage, xp, coins, items, note } of r.rewards) {
        const row = node('li');
        row.append(node('strong', stage));
        if (xp || coins) {
          const amounts = node('p', undefined, 'quest-reward-amounts');
          if (xp) amounts.append(underkeepXp(xp));
          if (coins) amounts.append((xp ? ' · ' : '') + coins + ' 金幣');
          row.append(amounts);
        }
        if (note) {
          const paragraph = node('p');
          paragraph.append(underkeepXpText(note));
          row.append(paragraph);
        }
        if (items?.length) entryLinks(row, '', 'items', items.map(id => itemsById.get(id)), itemOptions);
        rewards.append(row);
      }
      sheet.append(node('h3', '任務獎勵'), rewards);
    }
    if (r.itemIds.length) entryLinks(sheet, '相關物品與取得來源', 'items', r.itemIds.map(id => itemsById.get(id)), itemOptions);
    sources(sheet, r, '任務地點', detailRoute, options);
    return sheet;
  }

  const resistanceTypes = ['近戰物理', '遠程物理', '火焰', '冰霜', '閃電', '毒素', '鮮血'];

  function artImage(src, className, loading = 'eager') {
    const img = node('img', undefined, className);
    img.loading = loading;
    img.src = src;
    img.alt = '';
    return img;
  }

  function statusBadge(key, detail) {
    const status = guide.combatStatuses[key];
    const badge = node('span', undefined, 'status-badge');
    badge.append(icon(status.icon), node('span', status.name));
    if (detail) badge.append(node('span', detail, 'muted'));
    return badge;
  }

  function enemyAttacks(attacks) {
    const skills = node('section', undefined, 'enemy-skills');
    skills.append(node('h3', '攻擊與技能'));
    if (!attacks.length) {
      skills.append(node('p', '—', 'muted'));
      return skills;
    }
    for (const attack of attacks) {
      const card = node('div', undefined, 'enemy-attack');
      const header = node('div', undefined, 'attack-heading');
      header.append(node('h4', '招式 ' + attack.slot + ' · ' + attack.name));
      if (attack.minLevel || attack.maxLevel) {
        const level = attack.minLevel && attack.maxLevel ? attack.minLevel + '–' + attack.maxLevel + ' 級' :
          attack.minLevel ? attack.minLevel + ' 級以上' : attack.maxLevel + ' 級以下';
        header.append(node('span', '隊伍 ' + level, 'attack-level'));
      }
      card.append(header, facts(attack.facts));
      if (attack.effects.length) {
        const effects = node('div', undefined, 'status-badges');
        effects.append(...attack.effects.map(([key, detail]) => statusBadge(key, detail)));
        card.append(effects);
      }
      skills.append(card);
    }
    return skills;
  }

  const enemyTypeIds = { '野獸': 'animal', '不死生物': 'undead', '惡魔': 'demon' };

  function enemyTypeBadge(r) {
    const category = r.facts.find(([label]) => label === '類別')?.[1];
    if (!category) return null;
    const badge = node('span', category, 'enemy-type-badge');
    const type = enemyTypeIds[category];
    if (type) {
      badge.dataset.type = type;
      badge.prepend(spriteIcon(guide.effectRects['hud_symbol_' + type], 'icon effect-icon'));
    }
    return badge;
  }

  function enemySheet(r, detailRoute, options) {
    const sheet = node('section', undefined, 'item-detail enemy-detail');
    const portrait = node('div', undefined, 'enemy-portrait');
    portrait.append(artImage(r.art, 'enemy-art'));
    sheet.append(portrait);
    if (r.intro?.trim()) sheet.append(node('p', r.intro, 'intro'));
    const attributes = r.facts.filter(([label]) => label !== '類別');
    sheet.append(facts(attributes));
    if (r.spawnCondition) sheet.append(node('h3', '現身條件'), node('p', r.spawnCondition));
    const resistances = new Map(r.resist);
    const rows = resistanceTypes.map(type => {
      const value = resistances.get(type) || '0%';
      const amount = Number.parseFloat(value);
      const color = statColor(amount) || 'muted';
      return [type, amount === 0 ? '—' : value, color];
    });
    sheet.append(node('h3', '傷害抗性'), facts(rows));
    sheet.append(node('h3', '狀態免疫'));
    if (r.immunities.length) {
      const badges = node('div', undefined, 'status-badges');
      badges.append(...r.immunities.map(key => statusBadge(key)));
      sheet.append(badges);
    } else sheet.append(node('p', '—', 'muted'));
    if (r.abilities.length) {
      const traits = node('div', undefined, 'status-badges');
      traits.append(...r.abilities.map(text => node('span', text, 'status-badge')));
      sheet.append(node('h3', '戰鬥特性'), traits);
    }
    sheet.append(enemyAttacks(r.attacks));
    if (r.sources.length || !r.spawnCondition) sources(sheet, r, '出沒位置', detailRoute, options);
    if (r.lootIds.length) entryLinks(sheet, '可取得的掉落物', 'items', r.lootIds.map(id => itemsById.get(id)), { ...options, showIcons: true });
    return sheet;
  }

  return { data: guide, addData, node, spriteIcon, route, placeLabel, sources, entryLinks, heading, facts, catalogHeading,
    itemsById, enemiesById, artImage, enemySheet, enemyTypeBadge, itemSheet, itemBadge, inventoryIcon, coinPrice, questSheet };
})();
