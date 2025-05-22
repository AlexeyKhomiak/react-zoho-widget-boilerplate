import React, { useState, useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import Papa from "papaparse";
import "./App.css";

const CsvLogProcessor = () => {
  // const [csvData, setCsvData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [activities, setActivities] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("all");
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (activities.length > 0) {
      const uniqueUsers = [
        ...new Set(activities.map((activity) => activity.User || "Unknown")),
      ];
      setUsers(uniqueUsers);
      renderChart();
    } else if (chartRef.current) {
      renderChart();
    }
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

    window.ZOHO.CRM.API.searchRecord({
      Entity: "Employees_Activities",
      Type: "criteria",
      Query: `(Date:equals:${formattedDate})`,
    })
      .then(function (response) {
        if (response && response.data) {
          setActivities(response.data);

          let relevantActivities = response.data;
          if (selectedUser !== "all") {
            relevantActivities = response.data.filter(
              (activity) => activity.User === selectedUser
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
      .catch(function (error) {
        console.error("Error fetching records:", error);
        setMessage("Error fetching activity records");
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
          ? activities
          : activities.filter((record) => record.User === selectedUser);

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
          (activity) => activity.User === newSelectedUser
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
    const activityLog = {};
    const userMap = {};
    const activityDurations = {};

    Papa.parse(csvData, {
      complete: (result) => {
        const rows = result.data;
        const headers = rows.shift();

        const executorColumnIndex = headers.findIndex(
          (header) =>
            header.trim().toLowerCase() === "выполнил(а)".toLowerCase()
        );

        const moduleColumnIndex = headers.findIndex(
          (header) => header.trim().toLowerCase() === "модуль".toLowerCase()
        );

        const executorIndex =
          executorColumnIndex !== -1 ? executorColumnIndex : 6;

        const moduleIndex = moduleColumnIndex !== -1 ? moduleColumnIndex : -1;

        rows.forEach((cols) => {
          const executor = cols[executorIndex]?.trim() || "";
          const module =
            moduleIndex !== -1 ? cols[moduleIndex]?.trim() || "" : "";

          if (
            executor === "Anton Kovalenko" ||
            executor === "" ||
            executor === "System Workflow" ||
            module === "Deluge"
          ) {
            return;
          }

          const user = cols[0].trim();
          const timestamp = cols[7].trim();

          if (!timestamp || !timestamp.split(" ")[1]) {
            return;
          }

          const date = timestamp.split(" ")[0];
          const [day, month, year] = date.split(".");
          const formattedDate = `${year}-${month}-${day}`;
          const timeSlot = timestamp.split(" ")[1].substring(0, 5);

          if (!activityLog[user]) {
            activityLog[user] = {};
            userMap[user] = { executor, date: formattedDate };
            activityDurations[user] = 0;
          }

          const slot = Math.floor(parseInt(timeSlot.split(":")[1]) / 10) * 10;
          const roundedTime = `${timeSlot.split(":")[0]}:${slot
            .toString()
            .padStart(2, "0")}`;

          activityLog[user][roundedTime] =
            (activityLog[user][roundedTime] || 0) + 1;
        });

        for (const user in activityLog) {
          activityDurations[user] = Object.keys(activityLog[user]).length * 10;
        }
      },
      delimiter: ",",
      quoteChar: '"',
      skipEmptyLines: true,
    });

    return { activityLog, userMap, activityDurations };
  };

  const saveToCustomModule = (activityLogResult) => {
    const { activityLog, userMap, activityDurations } = activityLogResult;

    const records = Object.keys(activityLog).map((user) => ({
      Name: `${userMap[user].date} - ${user}`,
      Date: userMap[user].date,
      Activity: JSON.stringify(activityLog[user]),
      User: userMap[user].executor,
      Activity_Duration: activityDurations[user],
    }));

    window.ZOHO.CRM.API.upsertRecord({
      Entity: "Employees_Activities",
      APIData: records,
      duplicate_check_fields: ["Name"],
      Trigger: [],
    })
      .then(function (response) {
        console.log("Records upserted:", response);
        fetchActivities(selectedDate);
      })
      .catch(function (error) {
        console.error("Error upserting records:", error);
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
        try {
          const csvData = e.target.result;
          const activityLogResult = processCSV(csvData);
          setMessage("Saving data to CRM...");
          saveToCustomModule(activityLogResult);
          setMessage("Data uploaded successfully!");
        } catch (error) {
          console.error("Error processing file:", error);
          setMessage(
            "Error processing file. Please check console for details."
          );
        } finally {
          setLoading(false);
          setUploadingCsv(false);
        }
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
              disabled={uploadingCsv}
            >
              Upload CSV
            </button>
            {uploadingCsv && <div className="loader"></div>}
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
      {message && <p className="message">{message}</p>}

      <div className="chart-container">
        <canvas ref={chartRef}></canvas>
      </div>
    </div>
  );
};

export default CsvLogProcessor;
