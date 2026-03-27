-- ============================================================
-- Seed Data
-- ============================================================

-- Long Island Zip Codes (Nassau, Suffolk, bordering Queens)

INSERT INTO public.zip_codes (zip, latitude, longitude, city, county, state) VALUES
  ('11001', 40.7236, -73.7058, 'Floral Park', 'Nassau', 'NY'),
  ('11002', 40.7548, -73.6018, 'Floral Park', 'Nassau', 'NY'),
  ('11003', 40.6976, -73.7049, 'Elmont', 'Nassau', 'NY'),
  ('11004', 40.7481, -73.7114, 'Glen Oaks', 'Queens', 'NY'),
  ('11005', 40.7571, -73.7182, 'Floral Park', 'Queens', 'NY'),
  ('11010', 40.701, -73.6758, 'Franklin Square', 'Nassau', 'NY'),
  ('11020', 40.7742, -73.7189, 'Great Neck', 'Nassau', 'NY'),
  ('11021', 40.7867, -73.727, 'Great Neck', 'Nassau', 'NY'),
  ('11023', 40.7993, -73.7343, 'Great Neck', 'Nassau', 'NY'),
  ('11024', 40.8171, -73.7416, 'Great Neck', 'Nassau', 'NY'),
  ('11030', 40.7934, -73.6888, 'Manhasset', 'Nassau', 'NY'),
  ('11040', 40.7294, -73.6828, 'New Hyde Park', 'Nassau', 'NY'),
  ('11042', 40.7602, -73.695, 'New Hyde Park', 'Nassau', 'NY'),
  ('11050', 40.835, -73.6964, 'Port Washington', 'Nassau', 'NY'),
  ('11051', 40.7548, -73.6018, 'Port Washington', 'Nassau', 'NY'),
  ('11052', 40.7548, -73.6018, 'Port Washington', 'Nassau', 'NY'),
  ('11053', 40.7548, -73.6018, 'Port Washington', 'Nassau', 'NY'),
  ('11054', 40.7548, -73.6018, 'Port Washington', 'Nassau', 'NY'),
  ('11055', 40.7548, -73.6018, 'Port Washington', 'Nassau', 'NY'),
  ('11096', 40.6205, -73.7474, 'Inwood', 'Nassau', 'NY'),
  ('11099', 40.7548, -73.6018, 'New Hyde Park', 'Nassau', 'NY'),
  ('11360', 40.7807, -73.7812, 'Bayside', 'Queens', 'NY'),
  ('11361', 40.7627, -73.7745, 'Bayside', 'Queens', 'NY'),
  ('11362', 40.7591, -73.7326, 'Little Neck', 'Queens', 'NY'),
  ('11363', 40.7722, -73.7454, 'Little Neck', 'Queens', 'NY'),
  ('11364', 40.7428, -73.7588, 'Oakland Gardens', 'Queens', 'NY'),
  ('11411', 40.6947, -73.7374, 'Cambria Heights', 'Queens', 'NY'),
  ('11413', 40.6645, -73.7559, 'Springfield Gardens', 'Queens', 'NY'),
  ('11422', 40.6621, -73.7353, 'Rosedale', 'Queens', 'NY'),
  ('11426', 40.7347, -73.723, 'Bellerose', 'Queens', 'NY'),
  ('11427', 40.7277, -73.7489, 'Queens Village', 'Queens', 'NY'),
  ('11428', 40.7208, -73.7433, 'Queens Village', 'Queens', 'NY'),
  ('11429', 40.709, -73.7401, 'Queens Village', 'Queens', 'NY'),
  ('11432', 40.7119, -73.7944, 'Jamaica', 'Queens', 'NY'),
  ('11433', 40.6969, -73.7877, 'Jamaica', 'Queens', 'NY'),
  ('11434', 40.6775, -73.7758, 'Jamaica', 'Queens', 'NY'),
  ('11435', 40.7029, -73.8111, 'Jamaica', 'Queens', 'NY'),
  ('11436', 40.6763, -73.7966, 'Jamaica', 'Queens', 'NY'),
  ('11501', 40.7469, -73.6398, 'Mineola', 'Nassau', 'NY'),
  ('11507', 40.7703, -73.6514, 'Albertson', 'Nassau', 'NY'),
  ('11509', 40.5887, -73.7255, 'Atlantic Beach', 'Nassau', 'NY'),
  ('11510', 40.6548, -73.6097, 'Baldwin', 'Nassau', 'NY'),
  ('11514', 40.7512, -73.6119, 'Carle Place', 'Nassau', 'NY'),
  ('11516', 40.6236, -73.7264, 'Cedarhurst', 'Nassau', 'NY'),
  ('11518', 40.6404, -73.6674, 'East Rockaway', 'Nassau', 'NY'),
  ('11520', 40.6536, -73.5866, 'Freeport', 'Nassau', 'NY'),
  ('11530', 40.7245, -73.6487, 'Garden City', 'Nassau', 'NY'),
  ('11531', 40.7548, -73.6018, 'Garden City', 'Nassau', 'NY'),
  ('11535', 40.7548, -73.6018, 'Garden City', 'Nassau', 'NY'),
  ('11536', 40.7548, -73.6018, 'Garden City', 'Nassau', 'NY'),
  ('11542', 40.865, -73.6277, 'Glen Cove', 'Nassau', 'NY'),
  ('11545', 40.8281, -73.6076, 'Glen Head', 'Nassau', 'NY'),
  ('11547', 40.7548, -73.6018, 'Glenwood Landing', 'Nassau', 'NY'),
  ('11548', 40.8125, -73.6261, 'Greenvale', 'Nassau', 'NY'),
  ('11549', 40.7172, -73.6027, 'Hempstead', 'Nassau', 'NY'),
  ('11550', 40.7049, -73.6176, 'Hempstead', 'Nassau', 'NY'),
  ('11551', 40.7548, -73.6018, 'Hempstead', 'Nassau', 'NY'),
  ('11552', 40.6929, -73.6539, 'West Hempstead', 'Nassau', 'NY'),
  ('11553', 40.702, -73.592, 'Uniondale', 'Nassau', 'NY'),
  ('11554', 40.7149, -73.5561, 'East Meadow', 'Nassau', 'NY'),
  ('11555', 40.7548, -73.6018, 'Uniondale', 'Nassau', 'NY'),
  ('11556', 40.7548, -73.6018, 'Uniondale', 'Nassau', 'NY'),
  ('11557', 40.6404, -73.6957, 'Hewlett', 'Nassau', 'NY'),
  ('11558', 40.604, -73.6554, 'Island Park', 'Nassau', 'NY'),
  ('11559', 40.614, -73.733, 'Lawrence', 'Nassau', 'NY'),
  ('11560', 40.8817, -73.5927, 'Locust Valley', 'Nassau', 'NY'),
  ('11561', 40.5877, -73.6595, 'Long Beach', 'Nassau', 'NY'),
  ('11563', 40.6571, -73.6741, 'Lynbrook', 'Nassau', 'NY'),
  ('11565', 40.675, -73.6731, 'Malverne', 'Nassau', 'NY'),
  ('11566', 40.6685, -73.5536, 'Merrick', 'Nassau', 'NY'),
  ('11568', 40.7882, -73.5875, 'Old Westbury', 'Nassau', 'NY'),
  ('11569', 40.5905, -73.5808, 'Point Lookout', 'Nassau', 'NY'),
  ('11570', 40.6637, -73.638, 'Rockville Centre', 'Nassau', 'NY'),
  ('11571', 40.7548, -73.6018, 'Rockville Centre', 'Nassau', 'NY'),
  ('11572', 40.6362, -73.6375, 'Oceanside', 'Nassau', 'NY'),
  ('11575', 40.6802, -73.5867, 'Roosevelt', 'Nassau', 'NY'),
  ('11576', 40.7984, -73.6477, 'Roslyn', 'Nassau', 'NY'),
  ('11577', 40.7845, -73.6403, 'Roslyn Heights', 'Nassau', 'NY'),
  ('11579', 40.846, -73.6436, 'Sea Cliff', 'Nassau', 'NY'),
  ('11580', 40.6742, -73.7057, 'Valley Stream', 'Nassau', 'NY'),
  ('11581', 40.6523, -73.7118, 'Valley Stream', 'Nassau', 'NY'),
  ('11582', 40.7548, -73.6018, 'Valley Stream', 'Nassau', 'NY'),
  ('11590', 40.7557, -73.5723, 'Westbury', 'Nassau', 'NY'),
  ('11596', 40.7592, -73.6449, 'Williston Park', 'Nassau', 'NY'),
  ('11597', 40.7548, -73.6018, 'Westbury', 'Nassau', 'NY'),
  ('11598', 40.6326, -73.7141, 'Woodmere', 'Nassau', 'NY'),
  ('11599', 40.6076, -73.7427, 'Garden City', 'Nassau', 'NY'),
  ('11691', 40.6006, -73.758, 'Far Rockaway', 'Queens', 'NY'),
  ('11692', 40.5923, -73.7933, 'Arverne', 'Queens', 'NY'),
  ('11693', 40.6076, -73.8198, 'Far Rockaway', 'Queens', 'NY'),
  ('11694', 40.5766, -73.8428, 'Rockaway Park', 'Queens', 'NY'),
  ('11697', 40.5594, -73.9067, 'Breezy Point', 'Queens', 'NY'),
  ('11701', 40.6842, -73.4171, 'Amityville', 'Suffolk', 'NY'),
  ('11702', 40.6642, -73.341, 'Babylon', 'Suffolk', 'NY'),
  ('11703', 40.7321, -73.3236, 'North Babylon', 'Suffolk', 'NY'),
  ('11704', 40.7135, -73.3546, 'West Babylon', 'Suffolk', 'NY'),
  ('11705', 40.7444, -73.0542, 'Bayport', 'Suffolk', 'NY'),
  ('11706', 40.7051, -73.243, 'Bay Shore', 'Suffolk', 'NY'),
  ('11707', 40.9223, -72.6371, 'West Babylon', 'Suffolk', 'NY'),
  ('11709', 40.9074, -73.5601, 'Bayville', 'Nassau', 'NY'),
  ('11710', 40.6729, -73.5365, 'Bellmore', 'Nassau', 'NY'),
  ('11713', 40.7733, -72.9469, 'Bellport', 'Suffolk', 'NY'),
  ('11714', 40.74, -73.4857, 'Bethpage', 'Nassau', 'NY'),
  ('11715', 40.7501, -73.0352, 'Blue Point', 'Suffolk', 'NY'),
  ('11716', 40.7678, -73.1163, 'Bohemia', 'Suffolk', 'NY'),
  ('11717', 40.7809, -73.2503, 'Brentwood', 'Suffolk', 'NY'),
  ('11718', 40.728, -73.2646, 'Brightwaters', 'Suffolk', 'NY'),
  ('11719', 40.7843, -72.8921, 'Brookhaven', 'Suffolk', 'NY'),
  ('11720', 40.8705, -73.0822, 'Centereach', 'Suffolk', 'NY'),
  ('11722', 40.7866, -73.1961, 'Central Islip', 'Suffolk', 'NY'),
  ('11724', 40.8601, -73.4423, 'Cold Spring Harbor', 'Suffolk', 'NY'),
  ('11725', 40.843, -73.2799, 'Commack', 'Suffolk', 'NY'),
  ('11726', 40.6778, -73.3963, 'Copiague', 'Suffolk', 'NY'),
  ('11727', 40.885, -73.0069, 'Coram', 'Suffolk', 'NY'),
  ('11729', 40.7591, -73.3257, 'Deer Park', 'Suffolk', 'NY'),
  ('11730', 40.7282, -73.1805, 'East Islip', 'Suffolk', 'NY'),
  ('11731', 40.857, -73.3146, 'East Northport', 'Suffolk', 'NY'),
  ('11733', 40.9426, -73.1116, 'East Setauket', 'Suffolk', 'NY'),
  ('11735', 40.7315, -73.4327, 'Farmingdale', 'Nassau', 'NY'),
  ('11738', 40.8366, -73.0412, 'Farmingville', 'Suffolk', 'NY'),
  ('11739', 40.7297, -73.1607, 'Great River', 'Suffolk', 'NY'),
  ('11740', 40.8621, -73.3646, 'Greenlawn', 'Suffolk', 'NY'),
  ('11741', 40.7964, -73.0718, 'Holbrook', 'Suffolk', 'NY'),
  ('11742', 40.8105, -73.0416, 'Holtsville', 'Suffolk', 'NY'),
  ('11743', 40.8676, -73.4102, 'Huntington', 'Suffolk', 'NY'),
  ('11746', 40.8143, -73.3634, 'Huntington Station', 'Suffolk', 'NY'),
  ('11747', 40.7946, -73.403, 'Melville', 'Suffolk', 'NY'),
  ('11751', 40.7348, -73.2221, 'Islip', 'Suffolk', 'NY'),
  ('11752', 40.7548, -73.1827, 'Islip Terrace', 'Suffolk', 'NY'),
  ('11753', 40.7881, -73.5331, 'Jericho', 'Nassau', 'NY'),
  ('11754', 40.8861, -73.2438, 'Kings Park', 'Suffolk', 'NY'),
  ('11755', 40.8567, -73.1168, 'Lake Grove', 'Suffolk', 'NY'),
  ('11756', 40.7254, -73.5166, 'Levittown', 'Nassau', 'NY'),
  ('11757', 40.6884, -73.3745, 'Lindenhurst', 'Suffolk', 'NY'),
  ('11758', 40.6682, -73.4588, 'Massapequa', 'Nassau', 'NY'),
  ('11760', 40.8102, -73.1918, 'Hauppauge', 'Suffolk', 'NY'),
  ('11762', 40.6807, -73.4444, 'Massapequa Park', 'Nassau', 'NY'),
  ('11763', 40.8174, -72.9852, 'Medford', 'Suffolk', 'NY'),
  ('11764', 40.9436, -72.9913, 'Miller Place', 'Suffolk', 'NY'),
  ('11765', 40.8857, -73.5526, 'Mill Neck', 'Nassau', 'NY'),
  ('11766', 40.9271, -73.0127, 'Mount Sinai', 'Suffolk', 'NY'),
  ('11767', 40.8462, -73.1482, 'Nesconset', 'Suffolk', 'NY'),
  ('11768', 40.9051, -73.3309, 'Northport', 'Suffolk', 'NY'),
  ('11769', 40.7382, -73.1297, 'Oakdale', 'Suffolk', 'NY'),
  ('11770', 40.6443, -73.1613, 'Ocean Beach', 'Suffolk', 'NY'),
  ('11771', 40.866, -73.5272, 'Oyster Bay', 'Nassau', 'NY'),
  ('11772', 40.7609, -72.9871, 'Patchogue', 'Suffolk', 'NY'),
  ('11773', 40.7548, -73.6018, 'Syosset', 'Nassau', 'NY'),
  ('11775', 40.9223, -72.6371, 'Melville', 'Suffolk', 'NY'),
  ('11776', 40.9136, -73.0464, 'Port Jefferson Station', 'Suffolk', 'NY'),
  ('11777', 40.9457, -73.0611, 'Port Jefferson', 'Suffolk', 'NY'),
  ('11778', 40.9492, -72.9357, 'Rocky Point', 'Suffolk', 'NY'),
  ('11779', 40.8083, -73.1305, 'Ronkonkoma', 'Suffolk', 'NY'),
  ('11780', 40.8813, -73.1591, 'Saint James', 'Suffolk', 'NY'),
  ('11782', 40.7459, -73.0859, 'Sayville', 'Suffolk', 'NY'),
  ('11783', 40.6795, -73.491, 'Seaford', 'Nassau', 'NY'),
  ('11784', 40.8699, -73.0448, 'Selden', 'Suffolk', 'NY'),
  ('11786', 40.9485, -72.8927, 'Shoreham', 'Suffolk', 'NY'),
  ('11787', 40.8542, -73.2138, 'Smithtown', 'Suffolk', 'NY'),
  ('11788', 40.8231, -73.1958, 'Hauppauge', 'Suffolk', 'NY'),
  ('11789', 40.9567, -72.9742, 'Sound Beach', 'Suffolk', 'NY'),
  ('11790', 40.9068, -73.1277, 'Stony Brook', 'Suffolk', 'NY'),
  ('11791', 40.8146, -73.5024, 'Syosset', 'Nassau', 'NY'),
  ('11792', 40.952, -72.8348, 'Wading River', 'Suffolk', 'NY'),
  ('11793', 40.685, -73.5103, 'Wantagh', 'Nassau', 'NY'),
  ('11795', 40.7117, -73.3007, 'West Islip', 'Suffolk', 'NY'),
  ('11796', 40.732, -73.1, 'West Sayville', 'Suffolk', 'NY'),
  ('11797', 40.8154, -73.4716, 'Woodbury', 'Nassau', 'NY'),
  ('11798', 40.7523, -73.3761, 'Wyandanch', 'Suffolk', 'NY'),
  ('11801', 40.7623, -73.523, 'Hicksville', 'Nassau', 'NY'),
  ('11802', 40.7548, -73.6018, 'Hicksville', 'Nassau', 'NY'),
  ('11803', 40.7781, -73.4816, 'Plainview', 'Nassau', 'NY'),
  ('11804', 40.765, -73.4575, 'Old Bethpage', 'Nassau', 'NY'),
  ('11815', 40.7548, -73.6018, 'Hicksville', 'Nassau', 'NY'),
  ('11819', 40.7548, -73.6018, 'Hicksville', 'Nassau', 'NY'),
  ('11853', 40.7548, -73.6018, 'Jericho', 'Nassau', 'NY'),
  ('11901', 40.9262, -72.652, 'Riverhead', 'Suffolk', 'NY'),
  ('11930', 40.9895, -72.0959, 'Amagansett', 'Suffolk', 'NY'),
  ('11932', 40.9339, -72.3077, 'Bridgehampton', 'Suffolk', 'NY'),
  ('11933', 40.9297, -72.7423, 'Calverton', 'Suffolk', 'NY'),
  ('11934', 40.7997, -72.797, 'Center Moriches', 'Suffolk', 'NY'),
  ('11935', 41.0139, -72.4803, 'Cutchogue', 'Suffolk', 'NY'),
  ('11937', 40.993, -72.179, 'East Hampton', 'Suffolk', 'NY'),
  ('11939', 41.1264, -72.3419, 'East Marion', 'Suffolk', 'NY'),
  ('11940', 40.809, -72.7538, 'East Moriches', 'Suffolk', 'NY'),
  ('11941', 40.8297, -72.7283, 'Eastport', 'Suffolk', 'NY'),
  ('11942', 40.8428, -72.5813, 'East Quogue', 'Suffolk', 'NY'),
  ('11944', 41.1039, -72.3674, 'Greenport', 'Suffolk', 'NY'),
  ('11946', 40.8726, -72.5202, 'Hampton Bays', 'Suffolk', 'NY'),
  ('11947', 40.9223, -72.6371, 'Jamesport', 'Suffolk', 'NY'),
  ('11948', 40.9674, -72.554, 'Laurel', 'Suffolk', 'NY'),
  ('11949', 40.8421, -72.8002, 'Manorville', 'Suffolk', 'NY'),
  ('11950', 40.8064, -72.8566, 'Mastic', 'Suffolk', 'NY'),
  ('11951', 40.7657, -72.8537, 'Mastic Beach', 'Suffolk', 'NY'),
  ('11952', 40.9943, -72.5363, 'Mattituck', 'Suffolk', 'NY'),
  ('11953', 40.8782, -72.9525, 'Middle Island', 'Suffolk', 'NY'),
  ('11954', 41.0459, -71.944, 'Montauk', 'Suffolk', 'NY'),
  ('11955', 40.8095, -72.8229, 'Moriches', 'Suffolk', 'NY'),
  ('11956', 40.9223, -72.6371, 'New Suffolk', 'Suffolk', 'NY'),
  ('11959', 40.8226, -72.6012, 'Quogue', 'Suffolk', 'NY'),
  ('11960', 40.8086, -72.7064, 'Remsenburg', 'Suffolk', 'NY'),
  ('11961', 40.9018, -72.8881, 'Ridge', 'Suffolk', 'NY'),
  ('11962', 40.9305, -72.2707, 'Sagaponack', 'Suffolk', 'NY'),
  ('11963', 40.982, -72.3067, 'Sag Harbor', 'Suffolk', 'NY'),
  ('11964', 41.064, -72.3366, 'Shelter Island', 'Suffolk', 'NY'),
  ('11965', 40.9223, -72.6371, 'Shelter Island Heights', 'Suffolk', 'NY'),
  ('11967', 40.7439, -72.876, 'Shirley', 'Suffolk', 'NY'),
  ('11968', 40.9043, -72.4103, 'Southampton', 'Suffolk', 'NY'),
  ('11969', 40.9223, -72.6371, 'Southampton', 'Suffolk', 'NY'),
  ('11970', 40.9223, -72.6371, 'South Jamesport', 'Suffolk', 'NY'),
  ('11971', 41.0556, -72.429, 'Southold', 'Suffolk', 'NY'),
  ('11972', 40.9223, -72.6371, 'Speonk', 'Suffolk', 'NY'),
  ('11973', 40.8678, -72.8822, 'Upton', 'Suffolk', 'NY'),
  ('11975', 40.9396, -72.2425, 'Wainscott', 'Suffolk', 'NY'),
  ('11976', 40.9209, -72.3491, 'Water Mill', 'Suffolk', 'NY'),
  ('11977', 40.818, -72.6699, 'Westhampton', 'Suffolk', 'NY'),
  ('11978', 40.8295, -72.6473, 'Westhampton Beach', 'Suffolk', 'NY'),
  ('11980', 40.837, -72.9174, 'Yaphank', 'Suffolk', 'NY')
ON CONFLICT (zip) DO NOTHING;

-- NY State License Verification URLs

INSERT INTO public.license_verification_urls (credential, state, url, display_name) VALUES
  ('hha', 'NY', 'https://www.health.ny.gov/professionals/home_health_aides/', 'NY Department of Health'),
  ('cna', 'NY', 'https://www.health.ny.gov/professionals/nursing_home_administrator/narse.htm', 'NY Nurse Aide Registry'),
  ('lpn', 'NY', 'http://www.op.nysed.gov/opsearches.htm', 'NY State Education Department'),
  ('rn', 'NY', 'http://www.op.nysed.gov/opsearches.htm', 'NY State Education Department'),
  ('np', 'NY', 'http://www.op.nysed.gov/opsearches.htm', 'NY State Education Department')
ON CONFLICT (credential, state) DO NOTHING;
