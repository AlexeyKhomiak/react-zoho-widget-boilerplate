import React, { useState, useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import Papa from "papaparse";
import "./App.css";

const CsvLogProcessor = () => {
  const [csvData, setCsvData] = useState(null);
  const [loading, setLoading] = useState(false);
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

  // useEffect(() => {
  //   const today = new Date().toISOString().split("T")[0];
  //   setSelectedDate(today);

  //   // Initialize ZOHO API first, then set up the PageLoad handler
  //   window.ZOHO.embeddedApp
  //     .init()
  //     .then(() => {
  //       // window.ZOHO.embeddedApp.on("PageLoad", function (data) {
  //       //   console.log("Page loaded with data:", data);
  //       //   fetchActivities(today); // Fetch activities for the current day
  //       // });
  //       // Fetch activities for the current day immediately after initialization
  //       fetchActivities(today);
  //     })
  //     .catch((error) => {
  //       console.error("Error initializing ZOHO API:", error);
  //       setMessage(
  //         "Error initializing ZOHO API. Please check console for details."
  //       );
  //     });
  // }, []);

  useEffect(() => {
    if (activities.length > 0) {
      const uniqueUsers = [
        ...new Set(activities.map((activity) => activity.User || "Unknown")),
      ];
      setUsers(uniqueUsers);
      renderChart();
    } else if (chartRef.current) {
      renderChart(); // Render chart even if there are no activities
    }
  }, [activities, selectedUser]);

  const fetchActivities = (date) => {
    setLoading(true);
    setMessage("Fetching activities...");

    // Format the date properly for the API query
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
          setMessage(
            `Found ${response.data.length} activity records for ${formattedDate}`
          );
        } else {
          setActivities([]); // Set empty activities to ensure the chart renders
          setMessage(`No activities found for ${formattedDate}`);
        }
        setLoading(false);
      })
      .catch(function (error) {
        console.error("Error fetching records:", error);
        setMessage("Error fetching activity records");
        setLoading(false);
        setActivities([]); // Set empty activities to ensure the chart renders
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

    // Ensure the date is passed correctly to fetchActivities
    fetchActivities(newDate);
  };

  const handleUserChange = (event) => {
    setSelectedUser(event.target.value);
  };

  const processCSV = (csvData) => {
    const activityLog = {};
    const userMap = {};

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

          // Skip rows with specific executor values or when module is "Deluge"
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

          const date = timestamp.split(" ")[0]; // Extract the date from the timestamp
          const [day, month, year] = date.split("."); // Split the date into day, month, year
          const formattedDate = `${year}-${month}-${day}`; // Format the date as yyyy-mm-dd
          const timeSlot = timestamp.split(" ")[1].substring(0, 5);

          if (!activityLog[user]) {
            activityLog[user] = {};
            userMap[user] = { executor, date: formattedDate }; // Store the executor/user relationship and formatted date
          }

          const slot = Math.floor(parseInt(timeSlot.split(":")[1]) / 10) * 10;
          const roundedTime = `${timeSlot.split(":")[0]}:${slot
            .toString()
            .padStart(2, "0")}`;

          activityLog[user][roundedTime] =
            (activityLog[user][roundedTime] || 0) + 1;
        });
      },
      delimiter: ",",
      quoteChar: '"',
      skipEmptyLines: true,
    });

    return { activityLog, userMap };
  };

  const saveToCustomModule = (activityLogResult) => {
    const { activityLog, userMap } = activityLogResult;

    const records = Object.keys(activityLog).map((user) => ({
      Name: `${userMap[user].date} - ${user}`,
      Date: userMap[user].date, // Use the date from the CSV file
      Activity: JSON.stringify(activityLog[user]),
      User: userMap[user].executor, // Store the executor in the User field
    }));

    window.ZOHO.CRM.API.upsertRecord({
      Entity: "Employees_Activities",
      APIData: records,
      duplicate_check_fields: ["Name"], // Use the Name field to check for duplicates
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
        }
      };

      reader.onerror = () => {
        setLoading(false);
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
          <button onClick={handleCSVUpload} className="button button-upload">
            Upload CSV
          </button>
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
