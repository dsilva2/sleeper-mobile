import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Papa from "papaparse";

interface Player {
  player_id: string;
  full_name: string;
  position: string;
  team: string;
}

interface League {
  name: string;
  roster_id: string;
}

interface PlayerAggregation {
  player_id: string;
  full_name: string;
  position: string;
  team: string;
  leagueCount: number;
  leagues: League[];
  espn_id?: string;
  stats?: {
    gp?: number;
    pts_ppr?: number;
    pass_td?: number;
    pass_yd?: number;
    rush_td?: number;
    rush_yd?: number;
    rec_td?: number;
    rec?: number;
    rec_yd?: number;
  };
}

export default function SleeperAnalyzer() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerAggregation, setPlayerAggregation] = useState<
    PlayerAggregation[]
  >([]);
  const [searched, setSearched] = useState(false);
  const [selectedPlayer, setSelectedPlayer] =
    useState<PlayerAggregation | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  type PlayerData = {
    sleeper_id?: string; // Mark optional in case of missing data
    espn_id?: string;
  };

  const fetchPlayerIdMappings = async (): Promise<Map<string, string>> => {
    try {
      const response = await fetch(
        "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv"
      );

      const csvText = await response.text();
      const parsedData = Papa.parse<PlayerData>(csvText, {
        header: true, // Auto-detect column headers
        skipEmptyLines: true,
      });

      const sleeperToEspnMap = new Map<string, string>();

      parsedData.data.forEach((player) => {
        if (player.sleeper_id && player.espn_id) {
          sleeperToEspnMap.set(player.sleeper_id, player.espn_id);
        }
      });

      console.log("✅ Sleeper to ESPN Mapping");
      return sleeperToEspnMap;
    } catch (error) {
      console.error("❌ Error fetching and parsing CSV:", error);
      return new Map(); // Return an empty Map on error
    }
  };

  const fetchSleeperData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Step 1: Get User ID
      const userResponse = await fetch(
        `https://api.sleeper.app/v1/user/${username}`
      );
      if (!userResponse.ok) {
        throw new Error("User not found");
      }
      const userData = await userResponse.json();
      const userId = userData.user_id;

      // Step 2: Get Leagues
      const leaguesResponse = await fetch(
        `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/2025`
      );
      const leagues = await leaguesResponse.json();

      // Step 3: Get Rosters for each league
      const playerMap = new Map<string, PlayerAggregation>();

      await Promise.all(
        leagues.map(async (league: any) => {
          const rostersResponse = await fetch(
            `https://api.sleeper.app/v1/league/${league.league_id}/rosters`
          );
          const rosters = await rostersResponse.json();

          const userRoster = rosters.find(
            (roster: any) => roster.owner_id === userId
          );

          if (userRoster && userRoster.players) {
            userRoster.players.forEach((playerId: string) => {
              if (!playerMap.has(playerId)) {
                playerMap.set(playerId, {
                  player_id: playerId,
                  full_name: "",
                  position: "",
                  team: "",
                  leagueCount: 1,
                  leagues: [
                    {
                      name: league.name,
                      roster_id: userRoster.roster_id,
                    },
                  ],
                });
              } else {
                const player = playerMap.get(playerId)!;
                player.leagueCount++;
                player.leagues.push({
                  name: league.name,
                  roster_id: userRoster.roster_id,
                });
              }
            });
          }
        })
      );

      // Step 4: Get Player Details, Stats, and ID Mappings
      const [playersResponse, statsResponse] = await Promise.all([
        fetch("https://api.sleeper.app/v1/players/nfl"),
        fetch("https://api.sleeper.app/v1/stats/nfl/regular/2024"),
      ]);

      const [playersData, statsData] = await Promise.all([
        playersResponse.json(),
        statsResponse.json(),
      ]);

      // Fetch player ID mappings
      const playerIdMappings = await fetchPlayerIdMappings();

      // Update player details and stats
      playerMap.forEach((value, key) => {
        const playerDetails = playersData[key];
        const playerStats = statsData[key];

        if (playerDetails) {
          value.full_name = playerDetails.full_name;
          value.position = playerDetails.position;
          value.team = playerDetails.team || "FA";
          value.stats = playerStats || {};
          value.espn_id = playerIdMappings.get(key) || "";
        }
      });

      const aggregatedPlayers = Array.from(playerMap.values())
        .filter((player) => player.full_name)
        .sort((a, b) => b.leagueCount - a.leagueCount);

      setPlayerAggregation(aggregatedPlayers);
      setSearched(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getPositionColor = (position: string) => {
    const colors: { [key: string]: string } = {
      QB: "#ff6b6b",
      RB: "#4ecdc4",
      WR: "#45b7d1",
      TE: "#96ceb4",
      K: "#ffeead",
      DEF: "#d4a4eb",
    };
    return colors[position] || "#gray";
  };

  const renderPlayerStats = (player: PlayerAggregation) => {
    if (!player.stats) return null;

    const stats = player.stats;
    switch (player.position) {
      case "QB":
        return (
          <>
            <Text style={styles.statItem}>Pass YDS: {stats.pass_yd || 0}</Text>
            <Text style={styles.statItem}>Pass TD: {stats.pass_td || 0}</Text>
            <Text style={styles.statItem}>Rush YDS: {stats.rush_yd || 0}</Text>
            <Text style={styles.statItem}>Rush TD: {stats.rush_td || 0}</Text>
          </>
        );
      case "RB":
        return (
          <>
            <Text style={styles.statItem}>Rush YDS: {stats.rush_yd || 0}</Text>
            <Text style={styles.statItem}>Rush TD: {stats.rush_td || 0}</Text>
            <Text style={styles.statItem}>Receptions: {stats.rec || 0}</Text>
            <Text style={styles.statItem}>Rec YDS: {stats.rec_yd || 0}</Text>
          </>
        );
      case "WR":
      case "TE":
        return (
          <>
            <Text style={styles.statItem}>Receptions: {stats.rec || 0}</Text>
            <Text style={styles.statItem}>Rec YDS: {stats.rec_yd || 0}</Text>
            <Text style={styles.statItem}>Rec TD: {stats.rec_td || 0}</Text>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image
          source={{
            uri: "https://sleepercdn.com/images/v2/logos/sleeper_icon.png",
          }}
          style={styles.headerImage}
        />
        <Text style={styles.title}>Sleeper Roster Analyzer</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.input}
          placeholder="Enter Sleeper username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={fetchSleeperData}
          disabled={loading || !username}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Ionicons name="search" size={24} color="white" />
          )}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={20} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {searched && !loading && playerAggregation.length === 0 && !error && (
        <View style={styles.noResultsContainer}>
          <Ionicons name="information-circle" size={24} color="#666" />
          <Text style={styles.noResultsText}>
            No players found for this user
          </Text>
        </View>
      )}

      <ScrollView style={styles.resultsContainer}>
        {playerAggregation.map((player) => (
          <TouchableOpacity
            key={player.player_id}
            style={styles.playerCard}
            onPress={() => {
              setSelectedPlayer(player);
              setModalVisible(true);
            }}
          >
            <View style={styles.playerHeader}>
              <View
                style={[
                  styles.positionBadge,
                  { backgroundColor: getPositionColor(player.position) },
                ]}
              >
                <Text style={styles.positionText}>{player.position}</Text>
              </View>
              <Text style={styles.leagueCount}>
                {player.leagueCount}{" "}
                {player.leagueCount === 1 ? "League" : "Leagues"}
              </Text>
            </View>

            <Text style={styles.playerName}>{player.full_name}</Text>
            <Text style={styles.teamName}>{player.team || "Free Agent"}</Text>

            <View style={styles.leaguesList}>
              {player.leagues.map((league, index) => (
                <Text key={index} style={styles.leagueName}>
                  • {league.name}
                </Text>
              ))}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedPlayer && (
              <>
                <View style={styles.modalHeader}>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => setModalVisible(false)}
                  >
                    <Ionicons name="close" size={24} color="#666" />
                  </TouchableOpacity>
                </View>

                <Image
                  source={{
                    uri: selectedPlayer.espn_id
                      ? `https://a.espncdn.com/i/headshots/nfl/players/full/${selectedPlayer.espn_id}.png`
                      : "https://sleepercdn.com/images/v2/icons/player_default.webp",
                  }}
                  style={styles.playerImage}
                />

                <View style={styles.playerDetailHeader}>
                  <View
                    style={[
                      styles.positionBadge,
                      {
                        backgroundColor: getPositionColor(
                          selectedPlayer.position
                        ),
                      },
                    ]}
                  >
                    <Text style={styles.positionText}>
                      {selectedPlayer.position}
                    </Text>
                  </View>
                  <Text style={styles.modalPlayerName}>
                    {selectedPlayer.full_name}
                  </Text>
                  <Text style={styles.modalTeamName}>
                    {selectedPlayer.team || "Free Agent"}
                  </Text>
                </View>

                <View style={styles.statsContainer}>
                  <Text style={styles.statsTitle}>2024 Stats</Text>
                  {renderPlayerStats(selectedPlayer)}
                </View>

                <View style={styles.leagueContainer}>
                  <Text style={styles.leaguesTitle}>
                    Leagues ({selectedPlayer.leagueCount})
                  </Text>
                  {selectedPlayer.leagues.map((league, index) => (
                    <Text key={index} style={styles.modalLeagueName}>
                      • {league.name}
                    </Text>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6fa",
    padding: 16,
  },
  header: {
    marginBottom: 20,
    alignItems: "center",
  },
  headerImage: {
    width: "100%",
    height: 80,
    borderRadius: 10,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2c3e50",
    textAlign: "center",
  },
  searchContainer: {
    flexDirection: "row",
    marginBottom: 16,
  },
  input: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  searchButton: {
    backgroundColor: "#3498db",
    borderRadius: 8,
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
    width: 50,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffe5e5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: "#ff6b6b",
    marginLeft: 8,
    fontSize: 14,
  },
  noResultsContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  noResultsText: {
    color: "#666",
    fontSize: 16,
    marginTop: 8,
  },
  resultsContainer: {
    flex: 1,
  },
  playerCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  playerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  positionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  positionText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 12,
  },
  leagueCount: {
    fontSize: 14,
    color: "#666",
  },
  playerName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 4,
  },
  teamName: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  leaguesList: {
    marginTop: 8,
  },
  leagueName: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    width: Dimensions.get("window").width * 0.9,
    maxHeight: Dimensions.get("window").height * 0.9,
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  closeButton: {
    padding: 8,
  },
  playerImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
  },
  playerDetailHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  modalPlayerName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2c3e50",
    marginTop: 8,
    textAlign: "center",
  },
  modalTeamName: {
    fontSize: 16,
    color: "#666",
    marginTop: 4,
  },
  statsContainer: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 12,
  },
  statItem: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  leagueContainer: {
    marginBottom: 16,
  },
  leaguesTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 12,
  },
  modalLeagueName: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
    paddingLeft: 8,
  },
});
