import React, { useState, useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import Papa from "papaparse";
import "./App.css";

const CsvLogProcessor = () => {
  const [loading, setLoading] = useState(false);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [verifyingData, setVerifyingData] = useState(false);
  const [verificationCountdown, setVerificationCountdown] = useState(0);
  const [message, setMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [activities, setActivities] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("all");
  const [userGroups, setUserGroups] = useState([]);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const fileInputRef = useRef(null);
  useEffect(() => {
    const executeCustomFunction = () => {
      const func_name = "GetUsersGroups";
      const req_data = {};

      window.ZOHO.CRM.FUNCTIONS.execute(func_name, req_data)
        .then(function (data) {
          console.log("GetUsersGroups", data);
          if (data && data.user_groups) {
            setUserGroups(data.user_groups);
          }
        })
        .catch(function (error) {
          console.error("Error executing GetUsersGroups function:", error);
        });
    };

    executeCustomFunction();
  }, []);

  useEffect(() => {
    if (activities.length > 0) {
      const uniqueUsers = [
        ...new Set(
          activities.map((activity) => activity.Participant || "Unknown")
        ),
      ];
      setUsers(uniqueUsers);
      renderChart();
    } else if (chartRef.current) {
      renderChart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, selectedUser]);

  const calculateTotalDuration = (activities) => {
    const durations = activities
      .map((item) => Number(item.Activity_Duration) || 0)
      .filter((val) => !isNaN(val));
    return durations.reduce((sum, val) => sum + val, 0);
  };

  const formatDuration = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours} hours ${minutes} minutes`;
  };

  // Helper function to search records in Zoho CRM
  const searchRecords = async (entity, query, silent = false) => {
    try {
      if (!silent) {
        setMessage(`Searching ${entity} records...`);
      }
      const response = await window.ZOHO.CRM.API.searchRecord({
        Entity: entity,
        Type: "criteria",
        Query: query,
      });
      return response?.data || [];
    } catch (error) {
      console.error(`Error searching ${entity} records:`, error);
      if (!silent) {
        setMessage(`Error searching ${entity} records`);
      }
      return [];
    }
  };

  // Helper function to upsert records in Zoho CRM
  const upsertRecords = async (
    entity,
    records,
    duplicateCheckFields = ["Name"]
  ) => {
    try {
      setMessage(`Saving data to ${entity}...`);
      const response = await window.ZOHO.CRM.API.upsertRecord({
        Entity: entity,
        APIData: records,
        duplicate_check_fields: duplicateCheckFields,
        Trigger: [],
      });
      console.log(`Records upserted to ${entity}:`, response);
      return response;
    } catch (error) {
      console.error(`Error upserting records to ${entity}:`, error);
      setMessage(`Error saving records to ${entity}`);
      throw error;
    }
  };

  const fetchActivities = (date) => {
    setLoading(true);
    setMessage("Fetching activities...");

    let formattedDate;
    try {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        throw new Error("Invalid date");
      }
      formattedDate = dateObj.toISOString().split("T")[0];
    } catch (error) {
      console.error("Invalid date format:", error);
      setMessage("Invalid date format. Please check your input.");
      setLoading(false);
      return;
    }

    console.log("Fetching activities for date:", formattedDate);

    searchRecords("Users_Activities", `(Date:equals:${formattedDate})`)
      .then((data) => {
        if (data.length > 0) {
          setActivities(data);

          let relevantActivities = data;
          if (selectedUser !== "all") {
            relevantActivities = data.filter(
              (activity) => activity.Participant === selectedUser
            );
          } else {
            // Filter out Group records when All Users is selected
            relevantActivities = data.filter(
              (activity) => activity.Record_Type !== "Group"
            );
          }

          const totalDuration = calculateTotalDuration(relevantActivities);
          const formattedDuration = formatDuration(totalDuration);

          setMessage(
            `Activity durations: ${formattedDuration} for ${formattedDate}.`
          );
        } else {
          setActivities([]);
          setMessage(`No activities found for ${formattedDate}`);
        }
        setLoading(false);
      })
      .catch((error) => {
        setLoading(false);
        setActivities([]);
      });
  };

  const renderChart = () => {
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    console.log("Rendering chart with activities:", activities);

    const timeSlots = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 10) {
        timeSlots.push(
          `${hour.toString().padStart(2, "0")}:${minute
            .toString()
            .padStart(2, "0")}`
        );
      }
    }

    const activityCounts = new Array(timeSlots.length).fill(0);

    if (activities.length > 0) {
      const filteredActivities =
        selectedUser === "all"
          ? activities.filter((record) => record.Record_Type !== "Group")
          : activities.filter((record) => record.Participant === selectedUser);

      filteredActivities.forEach((record) => {
        try {
          const activityData = JSON.parse(record.Activity);

          Object.entries(activityData).forEach(([timeSlot, count]) => {
            const index = timeSlots.indexOf(timeSlot);
            if (index !== -1) {
              activityCounts[index] += count;
            }
          });
        } catch (e) {
          console.error("Failed to parse activity data:", e);
        }
      });
    }

    const ctx = chartRef.current.getContext("2d");

    chartInstance.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: timeSlots,
        datasets: [
          {
            label:
              selectedUser === "all"
                ? "All Users Activities"
                : `${selectedUser}'s Activities`,
            data: activityCounts,
            backgroundColor: "rgba(54, 162, 235, 0.5)",
            borderColor: "rgba(54, 162, 235, 1)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Number of Activities",
            },
          },
          x: {
            title: {
              display: true,
              text: "Time Slot (10-minute intervals)",
            },
            ticks: {
              maxRotation: 90,
              minRotation: 90,
              autoSkip: true,
              maxTicksLimit: 24,
              callback: function (value, index) {
                const time = timeSlots[index];
                return time.endsWith(":00") ? time : "";
              },
            },
          },
        },
      },
    });
  };

  const handleDateChange = (event) => {
    const newDate = event.target.value;
    setSelectedDate(newDate);

    fetchActivities(newDate);
  };

  const handleUserChange = (event) => {
    const newSelectedUser = event.target.value;
    setSelectedUser(newSelectedUser);

    if (activities.length > 0) {
      let relevantActivities = activities;
      if (newSelectedUser !== "all") {
        relevantActivities = activities.filter(
          (activity) => activity.Participant === newSelectedUser
        );
      } else {
        // Filter out Group records when All Users is selected
        relevantActivities = activities.filter(
          (activity) => activity.Record_Type !== "Group"
        );
      }

      const totalDuration = calculateTotalDuration(relevantActivities);
      const formattedDuration = formatDuration(totalDuration);

      setMessage(
        `Activity durations: ${formattedDuration} for ${selectedDate}.`
      );
    }
  };
  const processCSV = (csvData) => {
    return new Promise((resolve, reject) => {
      try {
        const activities = {};
        const groupActivities = {};

        // Helper function to find user's group
        const findUserGroup = (executorName) => {
          if (!userGroups || !userGroups.length) return null;

          for (const group of userGroups) {
            if (!group.users || !group.users.length) continue;

            const user = group.users.find((user) => {
              const fullName = `${user.first_name} ${user.last_name}`;
              return (
                fullName === executorName || user.full_name === executorName
              );
            });

            if (user) {
              return {
                groupId: group.id,
                groupName: group.name,
                userId: user.id,
              };
            }
          }
          return null;
        };

        Papa.parse(csvData, {
          complete: (result) => {
            console.log("CSV parsing complete with rows:", result.data.length);

            try {
              const rows = result.data;
              if (!rows || rows.length < 2) {
                console.error("Invalid CSV data: not enough rows");
                reject(new Error("Invalid CSV data: not enough rows"));
                return;
              }

              const headers = rows.shift();
              console.log("CSV Headers:", headers);

              const executorColumnIndex = headers.findIndex(
                (header) =>
                  header?.trim()?.toLowerCase() === "выполнил(а)".toLowerCase()
              );

              const moduleColumnIndex = headers.findIndex(
                (header) =>
                  header?.trim()?.toLowerCase() === "модуль".toLowerCase()
              );

              const actionColumnIndex = headers.findIndex(
                (header) =>
                  header?.trim()?.toLowerCase() === "действие".toLowerCase()
              );

              console.log("Column indices:", {
                executor: executorColumnIndex,
                module: moduleColumnIndex,
                action: actionColumnIndex,
              });

              const executorIndex =
                executorColumnIndex !== -1 ? executorColumnIndex : 6;

              const moduleIndex =
                moduleColumnIndex !== -1 ? moduleColumnIndex : -1;

              const actionIndex =
                actionColumnIndex !== -1 ? actionColumnIndex : -1;

              // Track row processing
              let processedRows = 0;
              let validRows = 0;

              rows.forEach((cols) => {
                processedRows++;

                if (!cols || cols.length <= executorIndex) {
                  console.log(
                    `Skipping row ${processedRows}: insufficient columns`
                  );
                  return;
                }

                const executor = cols[executorIndex]?.trim() || "";
                const module =
                  moduleIndex !== -1 ? cols[moduleIndex]?.trim() || "" : "";
                const action =
                  actionIndex !== -1 ? cols[actionIndex]?.trim() || "" : "";

                if (
                  executor === "Anton Kovalenko" ||
                  executor === "" ||
                  executor === "System Workflow" ||
                  module === "Deluge" ||
                  (actionIndex !== -1 && action === "Подписка отменена")
                ) {
                  return;
                }

                // Ensure column 7 exists and contains timestamp
                if (!cols[7] || typeof cols[7] !== "string") {
                  console.log(
                    `Skipping row ${processedRows}: missing timestamp`
                  );
                  return;
                }

                const timestamp = cols[7].trim();

                if (!timestamp || !timestamp.includes(" ")) {
                  console.log(
                    `Skipping row ${processedRows}: invalid timestamp format`
                  );
                  return;
                }

                const timeParts = timestamp.split(" ");
                if (timeParts.length < 2) {
                  console.log(
                    `Skipping row ${processedRows}: timestamp missing time part`
                  );
                  return;
                }

                const date = timeParts[0];
                if (!date.includes(".")) {
                  console.log(
                    `Skipping row ${processedRows}: invalid date format`
                  );
                  return;
                }

                const dateParts = date.split(".");
                if (dateParts.length !== 3) {
                  console.log(
                    `Skipping row ${processedRows}: invalid date parts`
                  );
                  return;
                }

                const [day, month, year] = dateParts;
                const formattedDate = `${year}-${month}-${day}`;
                const timeSlot = timeParts[1].substring(0, 5);

                validRows++;

                // Find user's group information
                const userGroupInfo = findUserGroup(executor);

                // Create unique key combining user and date
                const userDateKey = `${formattedDate}_${executor}`;

                // Process individual user activity
                if (!activities[userDateKey]) {
                  activities[userDateKey] = {
                    log: {},
                    executor: executor,
                    date: formattedDate,
                    duration: 0,
                  };
                }

                const timePart = timeSlot.split(":");
                if (timePart.length !== 2) {
                  console.log(
                    `Skipping activity: invalid time format ${timeSlot}`
                  );
                  return;
                }

                const slot = Math.floor(parseInt(timePart[1]) / 10) * 10;
                const roundedTime = `${timePart[0]}:${slot
                  .toString()
                  .padStart(2, "0")}`;

                activities[userDateKey].log[roundedTime] =
                  (activities[userDateKey].log[roundedTime] || 0) + 1;

                // If user belongs to a group, add activity to group as well
                if (userGroupInfo) {
                  // Create unique key combining group and date
                  const groupDateKey = `${formattedDate}_${userGroupInfo.groupId}`;

                  if (!groupActivities[groupDateKey]) {
                    groupActivities[groupDateKey] = {
                      log: {},
                      groupName: userGroupInfo.groupName,
                      date: formattedDate,
                      duration: 0,
                      groupId: userGroupInfo.groupId,
                    };
                  }

                  // Add activity to group log
                  if (!groupActivities[groupDateKey].log[roundedTime]) {
                    groupActivities[groupDateKey].log[roundedTime] = 0;
                  }
                  groupActivities[groupDateKey].log[roundedTime] += 1;
                }
              });

              console.log(
                `CSV processing: ${processedRows} rows processed, ${validRows} valid activities found`
              );

              // Calculate durations for individual users
              for (const userDateKey in activities) {
                activities[userDateKey].duration =
                  Object.keys(activities[userDateKey].log).length * 10;
              }

              // Calculate durations for groups
              for (const groupDateKey in groupActivities) {
                groupActivities[groupDateKey].duration =
                  Object.keys(groupActivities[groupDateKey].log).length * 10;
              }

              console.log("Processed activities:", {
                userActivities: Object.keys(activities).length,
                groupActivities: Object.keys(groupActivities).length,
              });

              resolve({
                userActivities: activities,
                groupActivities: groupActivities,
              });
            } catch (error) {
              console.error("Error processing CSV data:", error);
              reject(error);
            }
          },
          error: (error) => {
            console.error("CSV parsing error:", error);
            reject(error);
          },
          delimiter: ",",
          quoteChar: '"',
          skipEmptyLines: true,
        });
      } catch (error) {
        console.error("Error in processCSV:", error);
        reject(error);
      }
    });
  };
  // Helper function to merge activity logs
  const mergeActivityLogs = (existingLog, newLog) => {
    try {
      const existingActivity =
        typeof existingLog === "string"
          ? JSON.parse(existingLog || "{}")
          : existingLog || {};

      // Merge activities (sum counts for same time slots)
      const mergedActivity = { ...existingActivity };

      Object.entries(newLog).forEach(([timeSlot, count]) => {
        mergedActivity[timeSlot] = (mergedActivity[timeSlot] || 0) + count;
      });

      return {
        mergedLog: mergedActivity,
        duration: Object.keys(mergedActivity).length * 10,
      };
    } catch (err) {
      console.error("Error merging activity logs:", err);
      return { mergedLog: newLog, duration: Object.keys(newLog).length * 10 };
    }
  };

  // Helper function to create or update user record
  const processUserRecord = (userData, existingRecord) => {
    if (existingRecord) {
      const { mergedLog, duration } = mergeActivityLogs(
        existingRecord.Activity,
        userData.log
      );

      return {
        id: existingRecord.id,
        Name: existingRecord.Name,
        Date: userData.date,
        Activity: JSON.stringify(mergedLog),
        Participant: userData.executor,
        Activity_Duration: duration,
        Record_Type: "User",
      };
    } else {
      return {
        Name: `${userData.date} - ${userData.executor}`,
        Date: userData.date,
        Activity: JSON.stringify(userData.log),
        Participant: userData.executor,
        Activity_Duration: userData.duration,
        Record_Type: "User",
      };
    }
  };

  // Helper function to create or update group record
  const processGroupRecord = (groupData, existingRecord) => {
    if (existingRecord) {
      const { mergedLog, duration } = mergeActivityLogs(
        existingRecord.Activity,
        groupData.log
      );

      return {
        id: existingRecord.id,
        Name: existingRecord.Name,
        Date: groupData.date,
        Activity: JSON.stringify(mergedLog),
        Participant: groupData.groupName,
        Activity_Duration: duration,
        Record_Type: "Group",
        Group_ID: groupData.groupId,
      };
    } else {
      return {
        Name: `${groupData.date} - ${groupData.groupName}`,
        Date: groupData.date,
        Activity: JSON.stringify(groupData.log),
        Participant: groupData.groupName,
        Activity_Duration: groupData.duration,
        Record_Type: "Group",
        Group_ID: groupData.groupId,
      };
    }
  };

  const saveToCustomModule = ({ userActivities, groupActivities }) => {
    // First, collect all unique dates to fetch existing records
    const allDates = new Set();

    Object.values(userActivities).forEach((activity) => {
      allDates.add(activity.date);
    });

    Object.values(groupActivities).forEach((activity) => {
      allDates.add(activity.date);
    });

    // Convert Set to Array
    const uniqueDates = Array.from(allDates);

    if (uniqueDates.length === 0) {
      setMessage("No valid data to save");
      return;
    }

    // Create a query to fetch existing records for these dates
    const dateQuery = uniqueDates
      .map((date) => `(Date:equals:${date})`)
      .join("OR");

    setMessage("Checking for existing records...");

    // Fetch existing records using the extracted function
    searchRecords("Users_Activities", dateQuery)
      .then((existingRecords) => {
        console.log("Existing records:", existingRecords);

        // Create lookup maps for quick access to existing records
        const existingUserRecords = {};
        const existingGroupRecords = {};

        existingRecords.forEach((record) => {
          const key = `${record.Date}_${record.Participant}`;

          if (record.Record_Type === "User") {
            existingUserRecords[key] = record;
          } else if (record.Record_Type === "Group") {
            existingGroupRecords[key] = record;
          }
        });

        // Process user records with merging
        const userRecords = Object.keys(userActivities).map((userDateKey) => {
          const userData = userActivities[userDateKey];
          const key = `${userData.date}_${userData.executor}`;
          const existingRecord = existingUserRecords[key];

          return processUserRecord(userData, existingRecord);
        });

        // Process group records with merging
        const groupRecords = Object.keys(groupActivities).map(
          (groupDateKey) => {
            const groupData = groupActivities[groupDateKey];
            const key = `${groupData.date}_${groupData.groupName}`;
            const existingRecord = existingGroupRecords[key];

            return processGroupRecord(groupData, existingRecord);
          }
        );

        // Combine both types of records
        const allRecords = [...userRecords, ...groupRecords];

        setMessage("Saving merged activities to CRM...");

        // Use the extracted function for upserting records
        return upsertRecords("Users_Activities", allRecords);
      })
      .then(() => {
        setMessage("Data uploaded successfully! Verifying...");

        const firstDate = uniqueDates[0];
        return verifyDataSaved(firstDate);
      })
      .then(() => {
        fetchActivities(selectedDate);
      })
      .catch((error) => {
        console.error("Error in save process:", error);
        if (!verifyingData) {
          setMessage(`Error: ${error.message || "Could not save data"}`);
        }
      });
  };

  // Data verification function
  const verifyDataSaved = async (searchDate, maxRetries = 90) => {
    setVerifyingData(true);
    setVerificationCountdown(maxRetries);

    let retries = 0;

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        try {
          const remainingTime = maxRetries - retries;
          setVerificationCountdown(remainingTime);

          const searchQuery = `(Date:equals:${searchDate})`;
          const response = await searchRecords(
            "Users_Activities",
            searchQuery,
            true
          );

          if (response && response.length > 0) {
            clearInterval(checkInterval);
            setVerifyingData(false);
            setVerificationCountdown(0);
            setMessage("Data successfully saved and verified!");
            resolve(response);
          } else if (retries >= maxRetries) {
            clearInterval(checkInterval);
            setVerifyingData(false);
            setVerificationCountdown(0);
            setMessage("Verification timeout. Data might not have been saved.");
            reject(new Error("Verification timeout"));
          }

          retries++;
        } catch (error) {
          retries++;
          const remainingTime = maxRetries - retries;
          setVerificationCountdown(remainingTime);

          if (retries >= maxRetries) {
            clearInterval(checkInterval);
            setVerifyingData(false);
            setVerificationCountdown(0);
            setMessage("Error during data verification.");
            reject(error);
          }
        }
      }, 2000);
    });
  };

  const handleCSVUpload = () => {
    const file = fileInputRef.current.files[0];
    if (file) {
      setLoading(true);
      setUploadingCsv(true);
      setMessage("Processing file...");

      const reader = new FileReader();
      reader.onload = (e) => {
        const csvData = e.target.result;
        processCSV(csvData)
          .then((activities) => {
            console.log("CSV processing complete:", activities);

            if (
              Object.keys(activities.userActivities).length === 0 &&
              Object.keys(activities.groupActivities).length === 0
            ) {
              throw new Error("No valid activities found in the CSV file");
            }

            setMessage("Saving data to CRM...");
            return saveToCustomModule(activities);
          })
          .then(() => {
            setMessage("Data uploaded successfully!");
          })
          .catch((error) => {
            console.error("Error processing file:", error);
            setMessage(
              `Error: ${
                error.message ||
                "Could not process file. Check console for details."
              }`
            );
          })
          .finally(() => {
            setLoading(false);
            setUploadingCsv(false);
          });
      };

      reader.onerror = () => {
        setLoading(false);
        setUploadingCsv(false);
        setMessage("Error reading file.");
      };

      reader.readAsText(file);
    }
  };

  return (
    <div className="dashboard-container">
      <h2 className="dashboard-title">Employee Activity Dashboard</h2>

      <div className="dashboard-controls">
        <div className="upload-container small-card">
          <h3 className="section-title">Upload New Activity Data</h3>
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            className="input"
          />
          <div className="upload-button-container">
            <button
              onClick={handleCSVUpload}
              className="button button-upload"
              disabled={uploadingCsv || verifyingData}
            >
              Upload CSV
            </button>
            {(uploadingCsv || verifyingData) && <div className="loader"></div>}
          </div>
        </div>

        <div className="filters-container small-card">
          <h3 className="section-title">Filters</h3>
          <div className="filters-row">
            <div className="filter-item">
              <input
                type="date"
                id="date-select"
                value={selectedDate}
                onChange={handleDateChange}
                className="input"
              />
            </div>
            <div className="filter-item">
              <select
                id="user-select"
                value={selectedUser}
                onChange={handleUserChange}
                className="input"
              >
                <option value="all">All Users</option>
                {users.map((user, index) => (
                  <option key={index} value={user}>
                    {user}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={() => fetchActivities(selectedDate)}
            className="button button-refresh"
          >
            Refresh Data
          </button>
        </div>
      </div>

      {loading && <p className="message">Loading...</p>}
      {verifyingData && (
        <p className="message verification-message">
          🔄 Verifying data save... ({verificationCountdown}s)
        </p>
      )}
      {!verifyingData && message && <p className="message">{message}</p>}

      <div className="chart-container">
        <canvas ref={chartRef}></canvas>
      </div>
    </div>
  );
};

export default CsvLogProcessor;
