'use strict';

// Areas use the map grid: left, top, width, height. A puzzle can cover disconnected rooms.
const underkeepMapPuzzles = (() => {
  const communityMap = id => 'https://www.oldgames.sk/en/dungeon-mapper/map/' + id;
  const hints = 'https://underkeep.cz/en/guide/walkthrough/puzzles-and-hints/';
  const towerWalkthrough = 'https://intoindiegames.com/walkthroughs/underkeep-walkthrough-part-6-ascending-the-underkeep-tower/';
  const puzzle = (area, title, goal, steps, source, route) => ({
    areas: Array.isArray(area[0]) ? area : [area], title, goal, steps, source, route
  });

  return {
    Starting_forest: [
      puzzle([-5, -29, 5, 5], '{{t:maps.puzzles.starting_forest.1.title|sq}}', '{{t:maps.puzzles.starting_forest.1.goal|sq}}', [
        '{{t:maps.puzzles.starting_forest.1.step-1|sq}}'
      ])
    ],
    Village_of_Underkeep: [
      puzzle([[2, -6, 3, 3], [-7, 1, 3, 3], [3, 10, 3, 3], [17, 6, 3, 3], [26, 1, 3, 3], [26, -15, 3, 3]],
        '{{t:maps.puzzles.village_of_underkeep.1.title|sq}}', '{{t:maps.puzzles.village_of_underkeep.1.goal|sq}}', [
        '{{t:maps.puzzles.village_of_underkeep.1.step-1|sq}}',
        '{{t:maps.puzzles.village_of_underkeep.1.step-2|sq}}',
        '{{t:maps.puzzles.village_of_underkeep.1.step-3|sq}}'
      ], communityMap(1825))
    ],
    Mines_under_forest: [
      puzzle([25, -30, 5, 5], '{{t:maps.puzzles.mines_under_forest.1.title|sq}}', '{{t:maps.puzzles.mines_under_forest.1.goal|sq}}', [
        '{{t:maps.puzzles.mines_under_forest.1.step-1|sq}}',
        '{{t:maps.puzzles.mines_under_forest.1.step-2|sq}}'
      ], hints),
      puzzle([23, -23, 6, 6], '{{t:maps.puzzles.mines_under_forest.2.title|sq}}', '{{t:maps.puzzles.mines_under_forest.2.goal|sq}}', [
        '{{t:maps.puzzles.mines_under_forest.2.step-1|sq}}',
        '{{t:maps.puzzles.mines_under_forest.2.step-2|sq}}'
      ], hints),
      puzzle([9, -42, 5, 4], '{{t:maps.puzzles.mines_under_forest.3.title|sq}}', '{{t:maps.puzzles.mines_under_forest.3.goal|sq}}', [
        '{{t:maps.puzzles.mines_under_forest.3.step-1|sq}}'
      ], communityMap(1826))
    ],
    Abandoned_Mines_Cave: [
      puzzle([15, -25, 7, 5], '{{t:maps.puzzles.abandoned_mines_cave.1.title|sq}}', '{{t:maps.puzzles.abandoned_mines_cave.1.goal|sq}}', [
        '{{t:maps.puzzles.abandoned_mines_cave.1.step-1|sq}}'
      ], communityMap(1827)),
      puzzle([22, -34, 6, 4], '{{t:maps.puzzles.abandoned_mines_cave.2.title|sq}}', '{{t:maps.puzzles.abandoned_mines_cave.2.goal|sq}}', [
        '{{t:maps.puzzles.abandoned_mines_cave.2.step-1|sq}}'
      ], communityMap(1827))
    ],
    Underkeep_Cemetery: [
      puzzle([13, 5, 6, 9], '{{t:maps.puzzles.underkeep_cemetery.1.title|sq}}', '{{t:maps.puzzles.underkeep_cemetery.1.goal|sq}}', [
        '{{t:maps.puzzles.underkeep_cemetery.1.step-1|sq}}',
        '{{t:maps.puzzles.underkeep_cemetery.1.step-2|sq}}',
        '{{t:maps.puzzles.underkeep_cemetery.1.step-3|sq}}'
      ], communityMap(1832)),
      puzzle([18, 12, 4, 4], '{{t:maps.puzzles.underkeep_cemetery.2.title|sq}}', '{{t:maps.puzzles.underkeep_cemetery.2.goal|sq}}', [
        '{{t:maps.puzzles.underkeep_cemetery.2.step-1|sq}}',
        '{{t:maps.puzzles.underkeep_cemetery.2.step-2|sq}}'
      ], 'https://underkeep.cz/en/guide/walkthrough/secret-areas/#a-side-entrance-to-the-mausoleum')
    ],
    Mausoleum: [
      puzzle([4, -1, 5, 5], '{{t:maps.puzzles.mausoleum.1.title|sq}}', '{{t:maps.puzzles.mausoleum.1.goal|sq}}', [
        '{{t:maps.puzzles.mausoleum.1.step-1|sq}}'
      ], 'https://underkeep.cz/en/guide/walkthrough/secret-areas/#a-side-entrance-to-the-mausoleum'),
      puzzle([9, -2, 6, 5], '{{t:maps.puzzles.mausoleum.2.title|sq}}', '{{t:maps.puzzles.mausoleum.2.goal|sq}}', [
        '{{t:maps.puzzles.mausoleum.2.step-1|sq}}'
      ])
    ],
    Mausoleum_2: [
      puzzle([-8, -4, 6, 6], '{{t:maps.puzzles.mausoleum_2.1.title|sq}}', '{{t:maps.puzzles.mausoleum_2.1.goal|sq}}', [
        '{{t:maps.puzzles.mausoleum_2.1.step-1|sq}}',
        '{{t:maps.puzzles.mausoleum_2.1.step-2|sq}}'
      ], communityMap(1834)),
      puzzle([7, -14, 8, 8], '{{t:maps.puzzles.mausoleum_2.2.title|sq}}', '{{t:maps.puzzles.mausoleum_2.2.goal|sq}}', [
        '{{t:maps.puzzles.mausoleum_2.2.step-1|sq}}',
        '{{t:maps.puzzles.mausoleum_2.2.step-2|sq}}'
      ], communityMap(1834), [
        [7, -10], [7, -11], [8, -11], [9, -11], [9, -10], [10, -10], [10, -9], [10, -8], [10, -7],
        [11, -7], [12, -7], [12, -8], [12, -9], [13, -9], [14, -9], [14, -10], [14, -11],
        [13, -11], [12, -11], [11, -11], [11, -12], [11, -13], [11, -14]
      ]),
      puzzle([8, 1, 9, 7], '{{t:maps.puzzles.mausoleum_2.3.title|sq}}', '{{t:maps.puzzles.mausoleum_2.3.goal|sq}}', [
        '{{t:maps.puzzles.mausoleum_2.3.step-1|sq}}',
        '{{t:maps.puzzles.mausoleum_2.3.step-2|sq}}'
      ], communityMap(1834))
    ],
    Mausoleum_3_2: [
      puzzle([-3, -17, 12, 9], '{{t:maps.puzzles.mausoleum_3_2.1.title|sq}}', '{{t:maps.puzzles.mausoleum_3_2.1.goal|sq}}', [
        '{{t:maps.puzzles.mausoleum_3_2.1.step-1|sq}}',
        '{{t:maps.puzzles.mausoleum_3_2.1.step-2|sq}}'
      ], communityMap(1836)),
      puzzle([3, 1, 6, 4], '{{t:maps.puzzles.mausoleum_3_2.2.title|sq}}', '{{t:maps.puzzles.mausoleum_3_2.2.goal|sq}}', [
        '{{t:maps.puzzles.mausoleum_3_2.2.step-1|sq}}'
      ], communityMap(1836))
    ],
    Caerlin_Woods: [
      puzzle([17, -23, 6, 5], '{{t:maps.puzzles.caerlin_woods.1.title|sq}}', '{{t:maps.puzzles.caerlin_woods.1.goal|sq}}', [
        '{{t:maps.puzzles.caerlin_woods.1.step-1|sq}}',
        '{{t:maps.puzzles.caerlin_woods.1.step-2|sq}}'
      ], communityMap(1840)),
      puzzle([-12, -47, 6, 4], '{{t:maps.puzzles.caerlin_woods.2.title|sq}}', '{{t:maps.puzzles.caerlin_woods.2.goal|sq}}', [
        '{{t:maps.puzzles.caerlin_woods.2.step-1|sq}}',
        '{{t:maps.puzzles.caerlin_woods.2.step-2|sq}}'
      ], communityMap(1840))
    ],
    Caerlin_West_Dungeon: [
      puzzle([12, -46, 6, 8], '{{t:maps.puzzles.caerlin_west_dungeon.1.title|sq}}', '{{t:maps.puzzles.caerlin_west_dungeon.1.goal|sq}}', [
        '{{t:maps.puzzles.caerlin_west_dungeon.1.step-1|sq}}',
        '{{t:maps.puzzles.caerlin_west_dungeon.1.step-2|sq}}',
        '{{t:maps.puzzles.caerlin_west_dungeon.1.step-3|sq}}'
      ], communityMap(1831))
    ],
    Forgotten_Vein: [
      puzzle([3, -64, 8, 5], '{{t:maps.puzzles.forgotten_vein.1.title|sq}}', '{{t:maps.puzzles.forgotten_vein.1.goal|sq}}', [
        '{{t:maps.puzzles.forgotten_vein.1.step-1|sq}}',
        '{{t:maps.puzzles.forgotten_vein.1.step-2|sq}}'
      ], hints),
      puzzle([7, -56, 5, 4], '{{t:maps.puzzles.forgotten_vein.2.title|sq}}', '{{t:maps.puzzles.forgotten_vein.2.goal|sq}}', [
        '{{t:maps.puzzles.forgotten_vein.2.step-1|sq}}'
      ], communityMap(1830))
    ],
    West_woods: [
      puzzle([7, -26, 10, 9], '{{t:maps.puzzles.west_woods.1.title|sq}}', '{{t:maps.puzzles.west_woods.1.goal|sq}}', [
        '{{t:maps.puzzles.west_woods.1.step-1|sq}}',
        '{{t:maps.puzzles.west_woods.1.step-2|sq}}'
      ], communityMap(1850)),
      puzzle([[23, -30, 6, 4], [30, -18, 4, 5]], '{{t:maps.puzzles.west_woods.2.title|sq}}', '{{t:maps.puzzles.west_woods.2.goal|sq}}', [
        '{{t:maps.puzzles.west_woods.2.step-1|sq}}',
        '{{t:maps.puzzles.west_woods.2.step-2|sq}}',
        '{{t:maps.puzzles.west_woods.2.step-3|sq}}'
      ], communityMap(1850))
    ],
    West_Dungeon_1: [
      puzzle([-36, -75, 7, 6], '{{t:maps.puzzles.west_dungeon_1.1.title|sq}}', '{{t:maps.puzzles.west_dungeon_1.1.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_1.1.step-1|sq}}',
        '{{t:maps.puzzles.west_dungeon_1.1.step-2|sq}}'
      ], communityMap(1853)),
      puzzle([-22, -64, 7, 7], '{{t:maps.puzzles.west_dungeon_1.2.title|sq}}', '{{t:maps.puzzles.west_dungeon_1.2.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_1.2.step-1|sq}}',
        '{{t:maps.puzzles.west_dungeon_1.2.step-2|sq}}'
      ], communityMap(1853)),
      puzzle([-30, -64, 7, 13], '{{t:maps.puzzles.west_dungeon_1.3.title|sq}}', '{{t:maps.puzzles.west_dungeon_1.3.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_1.3.step-1|sq}}',
        '{{t:maps.puzzles.west_dungeon_1.3.step-2|sq}}'
      ], communityMap(1853)),
      puzzle([-15, -64, 6, 6], '{{t:maps.puzzles.west_dungeon_1.4.title|sq}}', '{{t:maps.puzzles.west_dungeon_1.4.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_1.4.step-1|sq}}',
        '{{t:maps.puzzles.west_dungeon_1.4.step-2|sq}}'
      ], communityMap(1853)),
      puzzle([-21, -55, 7, 6], '{{t:maps.puzzles.west_dungeon_1.5.title|sq}}', '{{t:maps.puzzles.west_dungeon_1.5.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_1.5.step-1|sq}}',
        '{{t:maps.puzzles.west_dungeon_1.5.step-2|sq}}'
      ], communityMap(1853)),
      puzzle([-6, -75, 7, 5], '{{t:guide.eight_keys|sq}}', '{{t:maps.puzzles.west_dungeon_1.6.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_1.6.step-1|sq}}'
      ], communityMap(1853))
    ],
    East_Garden: [
      puzzle([0, -9, 7, 6], '{{t:maps.puzzles.east_garden.1.title|sq}}', '{{t:maps.puzzles.east_garden.1.goal|sq}}', [
        '{{t:maps.puzzles.east_garden.1.step-1|sq}}',
        '{{t:maps.puzzles.east_garden.1.step-2|sq}}'
      ], communityMap(1854)),
      puzzle([9, -8, 8, 7], '{{t:maps.puzzles.east_garden.2.title|sq}}', '{{t:maps.puzzles.east_garden.2.goal|sq}}', [
        '{{t:maps.puzzles.east_garden.2.step-1|sq}}',
        '{{t:maps.puzzles.east_garden.2.step-2|sq}}'
      ], communityMap(1854)),
      puzzle([0, 4, 7, 5], '{{t:maps.puzzles.east_garden.3.title|sq}}', '{{t:maps.puzzles.east_garden.3.goal|sq}}', [
        '{{t:maps.puzzles.east_garden.3.step-1|sq}}'
      ], hints),
      puzzle([17, 6, 11, 7], '{{t:maps.puzzles.east_garden.4.title|sq}}', '{{t:maps.puzzles.east_garden.4.goal|sq}}', [
        '{{t:maps.puzzles.east_garden.4.step-1|sq}}',
        '{{t:maps.puzzles.east_garden.4.step-2|sq}}'
      ], hints)
    ],
    West_Garden: [
      puzzle([0, -9, 7, 7], '{{t:maps.puzzles.west_garden.1.title|sq}}', '{{t:maps.puzzles.west_garden.1.goal|sq}}', [
        '{{t:maps.puzzles.west_garden.1.step-1|sq}}',
        '{{t:maps.puzzles.west_garden.1.step-2|sq}}'
      ], communityMap(1855)),
      puzzle([11, -8, 5, 5], '{{t:maps.puzzles.west_garden.2.title|sq}}', '{{t:maps.puzzles.west_garden.2.goal|sq}}', [
        '{{t:maps.puzzles.west_garden.2.step-1|sq}}',
        '{{t:maps.puzzles.west_garden.2.step-2|sq}}'
      ], communityMap(1855)),
      puzzle([-1, 3, 7, 7], '{{t:maps.puzzles.west_garden.3.title|sq}}', '{{t:maps.puzzles.west_garden.3.goal|sq}}', [
        '{{t:maps.puzzles.west_garden.3.step-1|sq}}',
        '{{t:maps.puzzles.west_garden.3.step-2|sq}}'
      ], communityMap(1855)),
      puzzle([10, 3, 9, 8], '{{t:maps.puzzles.west_garden.4.title|sq}}', '{{t:maps.puzzles.west_garden.4.goal|sq}}', [
        '{{t:maps.puzzles.west_garden.4.step-1|sq}}',
        '{{t:maps.puzzles.west_garden.4.step-2|sq}}'
      ], communityMap(1855))
    ],
    West_Dungeon_2: [
      puzzle([-26, -77, 7, 7], '{{t:maps.puzzles.west_dungeon_2.1.title|sq}}', '{{t:maps.puzzles.west_dungeon_2.1.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_2.1.step-1|sq}}',
        '{{t:maps.puzzles.west_dungeon_2.1.step-2|sq}}'
      ], communityMap(1856)),
      puzzle([-8, -77, 7, 7], '{{t:maps.puzzles.west_dungeon_2.2.title|sq}}', '{{t:maps.puzzles.west_dungeon_2.2.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_2.2.step-1|sq}}',
        '{{t:maps.puzzles.west_dungeon_2.2.step-2|sq}}'
      ], communityMap(1856)),
      puzzle([-24, -87, 8, 6], '{{t:maps.puzzles.west_dungeon_2.3.title|sq}}', '{{t:maps.puzzles.west_dungeon_2.3.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_2.3.step-1|sq}}',
        '{{t:maps.puzzles.west_dungeon_2.3.step-2|sq}}'
      ], communityMap(1856)),
      puzzle([-11, -91, 9, 6], '{{t:maps.puzzles.west_dungeon_2.4.title|sq}}', '{{t:maps.puzzles.west_dungeon_2.4.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_2.4.step-1|sq}}',
        '{{t:maps.puzzles.west_dungeon_2.4.step-2|sq}}'
      ], communityMap(1856)),
      puzzle([-17, -74, 6, 6], '{{t:maps.puzzles.west_dungeon_2.5.title|sq}}', '{{t:maps.puzzles.west_dungeon_2.5.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_2.5.step-1|sq}}'
      ], communityMap(1856)),
      puzzle([-22, -67, 5, 5], '{{t:maps.puzzles.west_dungeon_2.6.title|sq}}', '{{t:maps.puzzles.west_dungeon_2.6.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_2.6.step-1|sq}}',
        '{{t:maps.puzzles.west_dungeon_2.6.step-2|sq}}'
      ], communityMap(1856))
    ],
    West_Dungeon_3: [
      puzzle([-15, -74, 6, 5], '{{t:maps.puzzles.west_dungeon_3.1.title|sq}}', '{{t:maps.puzzles.west_dungeon_3.1.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_3.1.step-1|sq}}'
      ], communityMap(1857)),
      puzzle([-13, -66, 13, 7], '{{t:maps.puzzles.west_dungeon_3.2.title|sq}}', '{{t:maps.puzzles.west_dungeon_3.2.goal|sq}}', [
        '{{t:maps.puzzles.west_dungeon_3.2.step-1|sq}}',
        '{{t:maps.puzzles.west_dungeon_3.2.step-2|sq}}',
        '{{t:maps.puzzles.west_dungeon_3.2.step-3|sq}}'
      ], communityMap(1857))
    ],
    Tower_Level1: [
      puzzle([-5, -12, 5, 7], '{{t:maps.puzzles.tower_level1.1.title|sq}}', '{{t:maps.puzzles.tower_level1.1.goal|sq}}', [
        '{{t:maps.puzzles.tower_level1.1.step-1|sq}}',
        '{{t:maps.puzzles.tower_level1.1.step-2|sq}}',
        '{{t:maps.puzzles.tower_level1.1.step-3|sq}}'
      ], communityMap(1858), [
        [-2, -6], [-2, -7], [-2, -8], [-1, -8], [-1, -9], [-2, -9], [-3, -9], [-3, -8], [-3, -7],
        [-3, -6], [-4, -6], [-5, -6], [-5, -7], [-5, -8], [-4, -8], [-4, -9], [-5, -9], [-5, -10],
        [-5, -11], [-4, -11], [-4, -10], [-3, -10], [-2, -10], [-1, -10], [-1, -11]
      ]),
      puzzle([0, -15, 7, 3], '{{t:maps.puzzles.tower_level1.2.title|sq}}', '{{t:maps.puzzles.tower_level1.2.goal|sq}}', [
        '{{t:maps.puzzles.tower_level1.2.step-1|sq}}',
        '{{t:maps.puzzles.tower_level1.2.step-2|sq}}'
      ], towerWalkthrough),
      puzzle([7, -13, 5, 9], '{{t:maps.puzzles.tower_level1.3.title|sq}}', '{{t:maps.puzzles.tower_level1.3.goal|sq}}', [
        '{{t:maps.puzzles.tower_level1.3.step-1|sq}}',
        '{{t:maps.puzzles.tower_level1.3.step-2|sq}}',
        '{{t:maps.puzzles.tower_level1.3.step-3|sq}}'
      ], communityMap(1858), [
        [8, -11], [7, -11], [7, -10], [8, -10], [9, -10], [9, -11], [10, -11], [11, -11], [11, -10],
        [11, -9], [11, -8], [11, -7], [11, -6], [10, -6], [9, -6], [9, -7], [9, -8], [10, -8],
        [10, -9], [9, -9], [8, -9], [7, -9], [7, -8], [8, -8], [8, -7], [7, -7], [7, -6]
      ])
    ],
    Tower_Level2: [
      puzzle([-3, -5, 5, 4], '{{t:maps.puzzles.tower_level2.1.title|sq}}', '{{t:maps.puzzles.tower_level2.1.goal|sq}}', [
        '{{t:maps.puzzles.tower_level2.1.step-1|sq}}',
        '{{t:maps.puzzles.tower_level2.1.step-2|sq}}',
        '{{t:maps.puzzles.tower_level2.1.step-3|sq}}'
      ], communityMap(1859)),
      puzzle([4, -7, 8, 6], '{{t:maps.puzzles.tower_level2.2.title|sq}}', '{{t:maps.puzzles.tower_level2.2.goal|sq}}', [
        '{{t:maps.puzzles.tower_level2.2.step-1|sq}}',
        '{{t:maps.puzzles.tower_level2.2.step-2|sq}}'
      ], communityMap(1859))
    ],
    Tower_Level2_Corrupted: [
      puzzle([-3, -9, 6, 5], '{{t:maps.puzzles.tower_level2_corrupted.1.title|sq}}', '{{t:maps.puzzles.tower_level2_corrupted.1.goal|sq}}', [
        '{{t:maps.puzzles.tower_level2_corrupted.1.step-1|sq}}',
        '{{t:maps.puzzles.tower_level2_corrupted.1.step-2|sq}}'
      ], communityMap(1859)),
      puzzle([4, -7, 8, 6], '{{t:maps.puzzles.tower_level2_corrupted.2.title|sq}}', '{{t:maps.puzzles.tower_level2_corrupted.2.goal|sq}}', [
        '{{t:maps.puzzles.tower_level2_corrupted.2.step-1|sq}}',
        '{{t:maps.puzzles.tower_level2_corrupted.2.step-2|sq}}'
      ], communityMap(1859))
    ],
    Tower_Level3: [
      puzzle([0, -13, 7, 7], '{{t:maps.puzzles.tower_level3.1.title|sq}}', '{{t:maps.puzzles.tower_level3.1.goal|sq}}', [
        '{{t:maps.puzzles.tower_level3.1.step-1|sq}}',
        '{{t:maps.puzzles.tower_level3.1.step-2|sq}}'
      ], communityMap(1860)),
      puzzle([2, -18, 3, 4], '{{t:maps.puzzles.tower_level3.2.title|sq}}', '{{t:maps.puzzles.tower_level3.2.goal|sq}}', [
        '{{t:maps.puzzles.tower_level3.2.step-1|sq}}',
        '{{t:maps.puzzles.tower_level3.2.step-2|sq}}'
      ], communityMap(1860)),
      puzzle([4, -7, 5, 3], '{{t:maps.puzzles.tower_level3.3.title|sq}}', '{{t:maps.puzzles.tower_level3.3.goal|sq}}', [
        '{{t:maps.puzzles.tower_level3.3.step-1|sq}}',
        '{{t:maps.puzzles.tower_level3.3.step-2|sq}}'
      ], communityMap(1860))
    ],
    Tower_Level4: [
      puzzle([[0, -7, 5, 7], [-10, -6, 6, 5], [5, -7, 5, 4], [0, 0, 5, 5]], '{{t:maps.puzzles.tower_level4.1.title|sq}}',
        '{{t:maps.puzzles.tower_level4.1.goal|sq}}', [
        '{{t:maps.puzzles.tower_level4.1.step-1|sq}}',
        '{{t:maps.puzzles.tower_level4.1.step-2|sq}}',
        '{{t:maps.puzzles.tower_level4.1.step-3|sq}}'
      ], communityMap(1861)),
      puzzle([1, -14, 3, 5], '{{t:maps.puzzles.tower_level4.2.title|sq}}', '{{t:maps.puzzles.tower_level4.2.goal|sq}}', [
        '{{t:maps.puzzles.tower_level4.2.step-1|sq}}'
      ], towerWalkthrough)
    ],
    Tower_Level5: [
      puzzle([2, -7, 3, 9], '{{t:maps.puzzles.tower_level5.1.title|sq}}', '{{t:maps.puzzles.tower_level5.1.goal|sq}}', [
        '{{t:maps.puzzles.tower_level5.1.step-1|sq}}',
        '{{t:maps.puzzles.tower_level5.1.step-2|sq}}'
      ], communityMap(1862))
    ],
    Undertower: [
      puzzle([-3, -14, 5, 7], '{{t:maps.puzzles.undertower.1.title|sq}}', '{{t:maps.puzzles.undertower.1.goal|sq}}', [
        '{{t:maps.puzzles.undertower.1.step-1|sq}}',
        '{{t:maps.puzzles.undertower.1.step-2|sq}}'
      ], communityMap(1863))
    ],
    Surroundings_Cave: [
      puzzle([[-16, 8, 6, 5], [-19, 9, 3, 4]], '{{t:maps.puzzles.surroundings_cave.1.title|sq}}', '{{t:maps.puzzles.surroundings_cave.1.goal|sq}}', [
        '{{t:maps.puzzles.surroundings_cave.1.step-1|sq}}',
        '{{t:maps.puzzles.surroundings_cave.1.step-2|sq}}',
        '{{t:maps.puzzles.surroundings_cave.1.step-3|sq}}'
      ], communityMap(1839)),
      puzzle([-16, -3, 5, 3], '{{t:maps.puzzles.surroundings_cave.2.title|sq}}', '{{t:maps.puzzles.surroundings_cave.2.goal|sq}}', [
        '{{t:maps.puzzles.surroundings_cave.2.step-1|sq}}'
      ], communityMap(1839))
    ],
    Underkeep_Surroundings: [
      puzzle([27, -33, 5, 4], '{{t:maps.puzzles.underkeep_surroundings.1.title|sq}}', '{{t:maps.puzzles.underkeep_surroundings.1.goal|sq}}', [
        '{{t:maps.puzzles.underkeep_surroundings.1.step-1|sq}}'
      ], communityMap(1837)),
      puzzle([19, -38, 5, 5], '{{t:maps.puzzles.underkeep_surroundings.2.title|sq}}', '{{t:maps.puzzles.underkeep_surroundings.2.goal|sq}}', [
        '{{t:maps.puzzles.underkeep_surroundings.2.step-1|sq}}',
        '{{t:maps.puzzles.underkeep_surroundings.2.step-2|sq}}'
      ], towerWalkthrough)
    ],
    Dragon_den: [
      puzzle([-29, -68, 6, 5], '{{t:maps.puzzles.dragon_den.1.title|sq}}', '{{t:maps.puzzles.dragon_den.1.goal|sq}}', [
        '{{t:maps.puzzles.dragon_den.1.step-1|sq}}',
        '{{t:maps.puzzles.dragon_den.1.step-2|sq}}'
      ], communityMap(1851)),
      puzzle([-16, -57, 10, 5], '{{t:maps.puzzles.dragon_den.2.title|sq}}', '{{t:maps.puzzles.dragon_den.2.goal|sq}}', [
        '{{t:maps.puzzles.dragon_den.2.step-1|sq}}'
      ], communityMap(1851)),
      puzzle([0, -61, 5, 5], '{{t:maps.puzzles.dragon_den.3.title|sq}}', '{{t:maps.puzzles.dragon_den.3.goal|sq}}', [
        '{{t:maps.puzzles.dragon_den.3.step-1|sq}}'
      ], communityMap(1851))
    ],
    Swamp: [
      puzzle([39, 27, 18, 15], '{{t:guide.misty_maze|sq}}', '{{t:maps.puzzles.swamp.1.goal|sq}}', [
        '{{t:maps.puzzles.swamp.1.step-1|sq}}',
        '{{t:maps.puzzles.swamp.1.step-2|sq}}'
      ], communityMap(1845)),
      puzzle([43, 39, 3, 4], '{{t:maps.puzzles.swamp.2.title|sq}}', '{{t:maps.puzzles.swamp.2.goal|sq}}', [
        '{{t:maps.puzzles.swamp.2.step-1|sq}}'
      ], communityMap(1845))
    ],
    Swamp_Dungeon1: [
      puzzle([3, -18, 5, 5], '{{t:maps.puzzles.swamp_dungeon1.1.title|sq}}', '{{t:maps.puzzles.swamp_dungeon1.1.goal|sq}}', [
        '{{t:maps.puzzles.swamp_dungeon1.1.step-1|sq}}',
        '{{t:maps.puzzles.swamp_dungeon1.1.step-2|sq}}',
        '{{t:maps.puzzles.swamp_dungeon1.1.step-3|sq}}'
      ], hints + '#the-mireheart-four-pink-fountains'),
      puzzle([-17, -4, 6, 6], '{{t:maps.puzzles.swamp_dungeon1.2.title|sq}}', '{{t:maps.puzzles.swamp_dungeon1.2.goal|sq}}', [
        '{{t:maps.puzzles.swamp_dungeon1.2.step-1|sq}}'
      ], communityMap(1846)),
      puzzle([-17, 12, 5, 4], '{{t:maps.puzzles.swamp_dungeon1.3.title|sq}}', '{{t:maps.puzzles.swamp_dungeon1.3.goal|sq}}', [
        '{{t:maps.puzzles.swamp_dungeon1.3.step-1|sq}}'
      ], communityMap(1846))
    ],
    Swamp_Dungeon2: [
      puzzle([-7, -7, 8, 8], '{{t:maps.puzzles.swamp_dungeon2.1.title|sq}}', '{{t:maps.puzzles.swamp_dungeon2.1.goal|sq}}', [
        '{{t:maps.puzzles.swamp_dungeon2.1.step-1|sq}}',
        '{{t:maps.puzzles.swamp_dungeon2.1.step-2|sq}}',
        '{{t:maps.puzzles.swamp_dungeon2.1.step-3|sq}}'
      ], communityMap(1847)),
      puzzle([-17, -12, 6, 5], '{{t:maps.puzzles.swamp_dungeon2.2.title|sq}}', '{{t:maps.puzzles.swamp_dungeon2.2.goal|sq}}', [
        '{{t:maps.puzzles.swamp_dungeon2.2.step-1|sq}}'
      ], communityMap(1847))
    ],
    Swamp_Lost_City: [
      puzzle([-1, -18, 5, 4], '{{t:maps.puzzles.swamp_lost_city.1.title|sq}}', '{{t:maps.puzzles.swamp_lost_city.1.goal|sq}}', [
        '{{t:maps.puzzles.swamp_lost_city.1.step-1|sq}}'
      ], communityMap(1849))
    ]
  };
})();
