/**
 * Bandeaux « guide destination » : URLs stables (Wikimedia Commons, miniatures 1920px quand dispo).
 * Priorité avant pageimages Wikipédia (souvent une photo hors-sujet ou de faible qualité).
 * Clés = sortie de normalizeTextForSearch (ville canonique ou alias).
 * Priorité aux repères visuels reconnaissables « carte postale » (monument, pont, skyline avec icône),
 * adaptés à un bandeau large — éviter gratte-ciel anonymes seuls, portraits et cadrages trop serrés.
 *
 * Après modification des URLs : `npm run verify:city-heroes` (ratio largeur/hauteur + accessibilité).
 */
export const WIKIMEDIA_CURATED_CITY_HEROES = Object.freeze({
  madrid: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Madrid_Gran_Via_Navidad_2008.jpg/1920px-Madrid_Gran_Via_Navidad_2008.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Plaza_Mayor_de_Madrid%2C_Panorama_2.jpg/1920px-Plaza_Mayor_de_Madrid%2C_Panorama_2.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Madrid_-_Plaza_Mayor_2012.jpg/1920px-Madrid_-_Plaza_Mayor_2012.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/2/29/Madrid-Almudena_Cathedral_and_Royal_Palace.jpg",
  ],
  barcelona: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Simetr%C3%ADa_na_Sagrada_Familia._Barcelona_B30.jpg/1920px-Simetr%C3%ADa_na_Sagrada_Familia._Barcelona_B30.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Sagrada_Familia_01.jpg/1920px-Sagrada_Familia_01.jpg",
  ],
  barcelone: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Simetr%C3%ADa_na_Sagrada_Familia._Barcelona_B30.jpg/1920px-Simetr%C3%ADa_na_Sagrada_Familia._Barcelona_B30.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Sagrada_Familia_01.jpg/1920px-Sagrada_Familia_01.jpg",
  ],
  paris: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Panorama_from_the_Eiffel_Tower_at_the_sunset%2C_Paris_20_April_2013.jpg/1920px-Panorama_from_the_Eiffel_Tower_at_the_sunset%2C_Paris_20_April_2013.jpg",
  ],
  london: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Palace_of_Westminster_-_wide_panorama_shot_from_Albert_Embankment%2C_March_2024.jpg/1920px-Palace_of_Westminster_-_wide_panorama_shot_from_Albert_Embankment%2C_March_2024.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Tower_Bridge_from_Shad_Thames.jpg/1920px-Tower_Bridge_from_Shad_Thames.jpg",
  ],
  londres: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Palace_of_Westminster_-_wide_panorama_shot_from_Albert_Embankment%2C_March_2024.jpg/1920px-Palace_of_Westminster_-_wide_panorama_shot_from_Albert_Embankment%2C_March_2024.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Tower_Bridge_from_Shad_Thames.jpg/1920px-Tower_Bridge_from_Shad_Thames.jpg",
  ],
  rome: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Colosseum_in_Rome%2C_Italy_-_April_2007.jpg/1920px-Colosseum_in_Rome%2C_Italy_-_April_2007.jpg",
  ],
  roma: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Colosseum_in_Rome%2C_Italy_-_April_2007.jpg/1920px-Colosseum_in_Rome%2C_Italy_-_April_2007.jpg",
  ],
  berlin: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Brandenburger_Tor%2C_Panorama_West-Seite_-_panoramio.jpg/1920px-Brandenburger_Tor%2C_Panorama_West-Seite_-_panoramio.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Reichstag_building_Berlin_view_from_west_before_sunset.jpg/1920px-Reichstag_building_Berlin_view_from_west_before_sunset.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Brandenburger_Tor_morgens.jpg/1920px-Brandenburger_Tor_morgens.jpg",
  ],
  amsterdam: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Amsterdam_Canal_Tour.jpg/1920px-Amsterdam_Canal_Tour.jpg",
  ],
  milan: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Milano%2C_Duomo_with_Milan_Cathedral_and_Galleria_Vittorio_Emanuele_II%2C_2016.jpg/1920px-Milano%2C_Duomo_with_Milan_Cathedral_and_Galleria_Vittorio_Emanuele_II%2C_2016.jpg",
  ],
  milano: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Milano%2C_Duomo_with_Milan_Cathedral_and_Galleria_Vittorio_Emanuele_II%2C_2016.jpg/1920px-Milano%2C_Duomo_with_Milan_Cathedral_and_Galleria_Vittorio_Emanuele_II%2C_2016.jpg",
  ],
  venise: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Panorama_of_Canal_Grande_and_Ponte_di_Rialto%2C_Venice_-_September_2017.jpg/1920px-Panorama_of_Canal_Grande_and_Ponte_di_Rialto%2C_Venice_-_September_2017.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Canal_Grande_Chiesa_della_Salute_e_Dogana_dal_ponte_dell_Accademia.jpg/1920px-Canal_Grande_Chiesa_della_Salute_e_Dogana_dal_ponte_dell_Accademia.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Canal_Grande_in_Venice_001.jpg/1920px-Canal_Grande_in_Venice_001.jpg",
  ],
  venice: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Panorama_of_Canal_Grande_and_Ponte_di_Rialto%2C_Venice_-_September_2017.jpg/1920px-Panorama_of_Canal_Grande_and_Ponte_di_Rialto%2C_Venice_-_September_2017.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Canal_Grande_Chiesa_della_Salute_e_Dogana_dal_ponte_dell_Accademia.jpg/1920px-Canal_Grande_Chiesa_della_Salute_e_Dogana_dal_ponte_dell_Accademia.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Canal_Grande_in_Venice_001.jpg/1920px-Canal_Grande_in_Venice_001.jpg",
  ],
  tokyo: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Minato_City%2C_Tokyo%2C_Japan.jpg/1920px-Minato_City%2C_Tokyo%2C_Japan.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Tokyo_Skytree_Panorama.jpg/1920px-Tokyo_Skytree_Panorama.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Kaminarimon_-_Tokyo_-_2022_Nov_25_1020AM_-_360_panorama.jpeg/1920px-Kaminarimon_-_Tokyo_-_2022_Nov_25_1020AM_-_360_panorama.jpeg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Tokyo_Shibuya_Scramble_Crossing_2018-10-09.jpg/1920px-Tokyo_Shibuya_Scramble_Crossing_2018-10-09.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Tokyo_Bay_panorama_%2846863229212%29.jpg/1920px-Tokyo_Bay_panorama_%2846863229212%29.jpg",
  ],
  kyoto: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Kiyomizu_Dera_Temple_Kyoto_Skyline_%28219542405%29.jpeg/1920px-Kiyomizu_Dera_Temple_Kyoto_Skyline_%28219542405%29.jpeg",
  ],
  osaka: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Osaka_Castle_02bs3200.jpg/1920px-Osaka_Castle_02bs3200.jpg",
  ],
  seoul: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Panoramic_view_of_Hyangwonjeong_Pavilion_in_its_pond_at_Gyeongbokgung_Palace_with_blue_sky_in_Seoul.jpg/1920px-Panoramic_view_of_Hyangwonjeong_Pavilion_in_its_pond_at_Gyeongbokgung_Palace_with_blue_sky_in_Seoul.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/GyeongbokgungPanorama.JPG/1920px-GyeongbokgungPanorama.JPG",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Lotte_World_Tower_and_Namsan_Tower_in_Seoul.jpg/1920px-Lotte_World_Tower_and_Namsan_Tower_in_Seoul.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Lotte_World_Tower_near_Cheongdam_Bridge_2022.jpg/1920px-Lotte_World_Tower_near_Cheongdam_Bridge_2022.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Gyeonghoeru_%28Royal_Banquet_Hall%29_at_Gyeongbokgung_Palace%2C_Seoul.jpg/1920px-Gyeonghoeru_%28Royal_Banquet_Hall%29_at_Gyeongbokgung_Palace%2C_Seoul.jpg",
  ],
  singapore: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Singapore_%28SG%29%2C_Marina_Bay_--_2019_--_4439-48.jpg/1920px-Singapore_%28SG%29%2C_Marina_Bay_--_2019_--_4439-48.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/ArtScience_Museum%2C_Marina_Bay_Sands%2C_Singapore.jpg/1920px-ArtScience_Museum%2C_Marina_Bay_Sands%2C_Singapore.jpg",
  ],
  bangkok: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Bangkok_city_panorama.jpg/1920px-Bangkok_city_panorama.jpg",
  ],
  jakarta: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Jakarta_Panorama.jpg/1920px-Jakarta_Panorama.jpg",
  ],
  bali: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Ulun_Danu_Bratan_Bali.jpg/1920px-Ulun_Danu_Bratan_Bali.jpg",
  ],
  lyon: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/01._Panorama_de_Lyon_pris_depuis_le_toit_de_la_Basilique_de_Fourvi%C3%A8re.jpg/1920px-01._Panorama_de_Lyon_pris_depuis_le_toit_de_la_Basilique_de_Fourvi%C3%A8re.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Panorama_Aux_Lazaristes_2.jpg/1920px-Panorama_Aux_Lazaristes_2.jpg",
  ],
  marseille: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Hafen_von_Marseille-Notre_Dame_de_la_Garde.jpg/1920px-Hafen_von_Marseille-Notre_Dame_de_la_Garde.jpg",
  ],
  toulouse: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Toulouse_Capitole_Night_Wikimedia_Commons.jpg/1920px-Toulouse_Capitole_Night_Wikimedia_Commons.jpg",
  ],
  bordeaux: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Bordeaux_-_Place_de_la_Bourse_2009-06-29.jpg/1920px-Bordeaux_-_Place_de_la_Bourse_2009-06-29.jpg",
  ],
  nantes: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Nantes_Butte_Sainte-Anne_panorama.jpg/1920px-Nantes_Butte_Sainte-Anne_panorama.jpg",
  ],
  lille: [
    "https://upload.wikimedia.org/wikipedia/commons/b/bd/Grand-Place_Lille_panorama.jpg",
  ],
  monaco: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Panorama_Monaco.jpg/1920px-Panorama_Monaco.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Panorama_Monaco_%28cropped%29.jpg/1920px-Panorama_Monaco_%28cropped%29.jpg",
  ],
  nice: [
    "https://upload.wikimedia.org/wikipedia/commons/1/1d/Nice_baie_des_Anges.jpg",
  ],
  bruxelles: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Grand-Place%2C_Brussels_-_panorama%2C_June_2018.jpg/1920px-Grand-Place%2C_Brussels_-_panorama%2C_June_2018.jpg",
  ],
  berne: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Bern_Panorama_von_Rosengarten_20211007.jpg/1920px-Bern_Panorama_von_Rosengarten_20211007.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Bern_Bundesplatz_panosphere_20211007.jpg/1920px-Bern_Bundesplatz_panosphere_20211007.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Summer_evening_in_Bern%2C_Switzerland_%2855119784447%29.jpg/1920px-Summer_evening_in_Bern%2C_Switzerland_%2855119784447%29.jpg",
  ],
  bern: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Bern_Panorama_von_Rosengarten_20211007.jpg/1920px-Bern_Panorama_von_Rosengarten_20211007.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Bern_Bundesplatz_panosphere_20211007.jpg/1920px-Bern_Bundesplatz_panosphere_20211007.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Summer_evening_in_Bern%2C_Switzerland_%2855119784447%29.jpg/1920px-Summer_evening_in_Bern%2C_Switzerland_%2855119784447%29.jpg",
  ],
  lisbonne: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Lisbon_Pra%C3%A7a_do_Com%C3%A9rcio_pano.jpg/1920px-Lisbon_Pra%C3%A7a_do_Com%C3%A9rcio_pano.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Alfama_Rooftops_and_Tagus_River_View%2C_Lisbon_%2854733828355%29.jpg/1920px-Alfama_Rooftops_and_Tagus_River_View%2C_Lisbon_%2854733828355%29.jpg",
  ],
  lisbon: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Lisbon_Pra%C3%A7a_do_Com%C3%A9rcio_pano.jpg/1920px-Lisbon_Pra%C3%A7a_do_Com%C3%A9rcio_pano.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Alfama_Rooftops_and_Tagus_River_View%2C_Lisbon_%2854733828355%29.jpg/1920px-Alfama_Rooftops_and_Tagus_River_View%2C_Lisbon_%2854733828355%29.jpg",
  ],
  porto: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Porto-Panorama_de_Ribeira-Rabelos-20120910.jpg/1920px-Porto-Panorama_de_Ribeira-Rabelos-20120910.jpg",
  ],
  prague: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Prague_07-2016_View_from_Old_Town_Hall_Tower_img3.jpg/1920px-Prague_07-2016_View_from_Old_Town_Hall_Tower_img3.jpg",
  ],
  vienne: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Schonbrunn_Palace_-_Vienna.jpg/1920px-Schonbrunn_Palace_-_Vienna.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Schoenbrunn_Palace_as_seen_from_Neptune_Fountain%2C_September_2016.jpg/1920px-Schoenbrunn_Palace_as_seen_from_Neptune_Fountain%2C_September_2016.jpg",
  ],
  vienna: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Schonbrunn_Palace_-_Vienna.jpg/1920px-Schonbrunn_Palace_-_Vienna.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Schoenbrunn_Palace_as_seen_from_Neptune_Fountain%2C_September_2016.jpg/1920px-Schoenbrunn_Palace_as_seen_from_Neptune_Fountain%2C_September_2016.jpg",
  ],
  budapest: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/HUN-2015-Budapest-Hungarian_Parliament_%28Budapest%29_2015-02.jpg/1920px-HUN-2015-Budapest-Hungarian_Parliament_%28Budapest%29_2015-02.jpg",
  ],
  athenes: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Attica_06-13_Athens_50_View_from_Philopappos_-_Acropolis_Hill.jpg/1920px-Attica_06-13_Athens_50_View_from_Philopappos_-_Acropolis_Hill.jpg",
  ],
  athens: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Attica_06-13_Athens_50_View_from_Philopappos_-_Acropolis_Hill.jpg/1920px-Attica_06-13_Athens_50_View_from_Philopappos_-_Acropolis_Hill.jpg",
  ],
  chicago: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Chicago_from_North_Avenue_Beach_June_2015_panorama_2.jpg/1920px-Chicago_from_North_Avenue_Beach_June_2015_panorama_2.jpg",
  ],
  "san francisco": [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Golden_Gate_Bridge_Panorama_Photo.jpg/1920px-Golden_Gate_Bridge_Panorama_Photo.jpg",
  ],
  toronto: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Sunset_Toronto_Skyline_Panorama_Crop_from_Snake_Island.jpg/1920px-Sunset_Toronto_Skyline_Panorama_Crop_from_Snake_Island.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/126_-_Toronto_-_Panorama_-_Septembre_2009.JPG/1920px-126_-_Toronto_-_Panorama_-_Septembre_2009.JPG",
  ],
  vancouver: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Vancouver_%28BC%2C_Canada%29%2C_Canada_Place_--_2022_--_2093.jpg/1920px-Vancouver_%28BC%2C_Canada%29%2C_Canada_Place_--_2022_--_2093.jpg",
  ],
  miami: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Brickell_neighborhood_skyline_%2860062p%29.jpg/1920px-Brickell_neighborhood_skyline_%2860062p%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Miami_Night_Skyline_from_across_the_Biscayne_Bay-Downtown-March_2011.JPG/1920px-Miami_Night_Skyline_from_across_the_Biscayne_Bay-Downtown-March_2011.JPG",
  ],
  "new york": [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Lower_Manhattan_from_Brooklyn_May_2015_panorama.jpg/1920px-Lower_Manhattan_from_Brooklyn_May_2015_panorama.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Lower_Manhattan_from_Jersey_City_November_2014_panorama_2.jpg/1920px-Lower_Manhattan_from_Jersey_City_November_2014_panorama_2.jpg",
  ],
  nyc: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Lower_Manhattan_from_Brooklyn_May_2015_panorama.jpg/1920px-Lower_Manhattan_from_Brooklyn_May_2015_panorama.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Lower_Manhattan_from_Jersey_City_November_2014_panorama_2.jpg/1920px-Lower_Manhattan_from_Jersey_City_November_2014_panorama_2.jpg",
  ],
  dubai: [
    "https://upload.wikimedia.org/wikipedia/commons/e/e0/Burj_dubai_3.11.08.jpg",
  ],
  "abu dhabi": [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Sheikh_Zayed_Masjid_in_Abu_Dhabi%2C_United_Arab_Emirates_-_panoramio.jpg/1920px-Sheikh_Zayed_Masjid_in_Abu_Dhabi%2C_United_Arab_Emirates_-_panoramio.jpg",
  ],
  doha: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Doha_-_Museum_of_Islamic_Art_01.jpg/1920px-Doha_-_Museum_of_Islamic_Art_01.jpg",
  ],
  shanghai: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Shanghai_Lujiazui_night_skyline_2017_-_Flickr.jpg/1920px-Shanghai_Lujiazui_night_skyline_2017_-_Flickr.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Pudong_Shanghai_November_2017_HDR_panorama.jpg/1920px-Pudong_Shanghai_November_2017_HDR_panorama.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Pudong_Shanghai_November_2017_panorama.jpg/1920px-Pudong_Shanghai_November_2017_panorama.jpg",
  ],
  beijing: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Gate_of_Divine_Might_%28Forbidden_City%29_2015_December_%28wide%29.jpg/1920px-Gate_of_Divine_Might_%28Forbidden_City%29_2015_December_%28wide%29.jpg",
  ],
  pekin: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Gate_of_Divine_Might_%28Forbidden_City%29_2015_December_%28wide%29.jpg/1920px-Gate_of_Divine_Might_%28Forbidden_City%29_2015_December_%28wide%29.jpg",
  ],
  guangzhou: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Canton_Tower_20241027.jpg/1920px-Canton_Tower_20241027.jpg",
  ],
  canton: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Canton_Tower_20241027.jpg/1920px-Canton_Tower_20241027.jpg",
  ],
  kwangchow: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Canton_Tower_20241027.jpg/1920px-Canton_Tower_20241027.jpg",
  ],
  sydney: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Sydney_Opera_House_-_Dec_2008.jpg/1920px-Sydney_Opera_House_-_Dec_2008.jpg",
  ],
  melbourne: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Flinders_Street_Station_Melbourne_March_2021_with_trams.jpg/1920px-Flinders_Street_Station_Melbourne_March_2021_with_trams.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Melbourne_Docklands_-_Yarras_Edge_-_marina_panorama.jpg/1920px-Melbourne_Docklands_-_Yarras_Edge_-_marina_panorama.jpg",
  ],
  auckland: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/00_1350_Panorama_of_Auckland_%28New_Zealand%29_-_Sky_Tower.jpg/1920px-00_1350_Panorama_of_Auckland_%28New_Zealand%29_-_Sky_Tower.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Auckland_CBD_skyline_from_Waitemata_Harbour_entrance.jpg/1920px-Auckland_CBD_skyline_from_Waitemata_Harbour_entrance.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Auckland_Skyline_as_seen_from_Devonport_20100128_3.jpg/1920px-Auckland_Skyline_as_seen_from_Devonport_20100128_3.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/5/54/Auckland_CBD_skyline_and_harbour.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/AucklandPano_MC.jpg/1920px-AucklandPano_MC.jpg",
  ],
  "cape town": [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Cape_Town_%28ZA%29%2C_Table_Mountain_--_2024_--_2794%2B96%2B98%2B2800%2B01.jpg/1920px-Cape_Town_%28ZA%29%2C_Table_Mountain_--_2024_--_2794%2B96%2B98%2B2800%2B01.jpg",
  ],
  "rio de janeiro": [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Unique_Moment_with_the_Moon_and_Christ_the_Redeemer_3.jpg/1920px-Unique_Moment_with_the_Moon_and_Christ_the_Redeemer_3.jpg",
  ],
  "sao paulo": [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Night_Panorama_-_S%C3%A3o_Paulo_-_Skyline_120705-3147-jikatu.jpg/1920px-Night_Panorama_-_S%C3%A3o_Paulo_-_Skyline_120705-3147-jikatu.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Reflection_of_Parque_Cultural_Paulista_building_in_Avenida_Paulista%2C_Brazil.jpg/1920px-Reflection_of_Parque_Cultural_Paulista_building_in_Avenida_Paulista%2C_Brazil.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Avenida_Paulista_street.jpg/1920px-Avenida_Paulista_street.jpg",
  ],
  phuket: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Phuket_Thailand_Big-Buddha-of-Phuket-05.jpg/1920px-Phuket_Thailand_Big-Buddha-of-Phuket-05.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Banana_beach_Phuket_2017_-_02.jpg/1920px-Banana_beach_Phuket_2017_-_02.jpg",
  ],
  "le caire": [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Giza_Pyramids_during_%22Forever_is_Now%22_exhibition.jpg/1920px-Giza_Pyramids_during_%22Forever_is_Now%22_exhibition.jpg",
  ],
  cairo: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Giza_Pyramids_during_%22Forever_is_Now%22_exhibition.jpg/1920px-Giza_Pyramids_during_%22Forever_is_Now%22_exhibition.jpg",
  ],
  marrakech: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Marrakech_Koutoubia_Mosque_%2854273634927%29.jpg/1920px-Marrakech_Koutoubia_Mosque_%2854273634927%29.jpg",
  ],
  tunis: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Panorama_de_Tunis_%28Tunisie%29_06.jpg/1920px-Panorama_de_Tunis_%28Tunisie%29_06.jpg",
  ],
  alger: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Notre_Dame_d%27Afrique.jpg/1920px-Notre_Dame_d%27Afrique.jpg",
  ],
  istanbul: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Hagia_Sophia_Mars_2013.jpg/1920px-Hagia_Sophia_Mars_2013.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Istanbul_skyline_03.jpg/1920px-Istanbul_skyline_03.jpg",
  ],
});
