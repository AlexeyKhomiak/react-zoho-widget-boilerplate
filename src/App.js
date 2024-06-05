import React, { useState, useEffect } from "react";
import "./App.css";

async function getRecord(module, recordId) {
  try {
    const response = await window.ZOHO.CRM.API.getRecord({
      Entity: module,
      RecordID: recordId,
    });
    const data = response.data[0];
    return { data };
  } catch (error) {
    throw error;
  }
}

function App(data) {
  const module = data?.data?.Entity;
  const recordId = data?.data?.EntityId;

  const [recordDetails, setRecordDetails] = useState(null);

   useEffect(() => {
     const fetchRecord = async () => {
       if (module && recordId) {
         try {
           const result = await getRecord(module, recordId);
           setRecordDetails(result.data);
         } catch (error) {
           console.error(error);
         }
       }
     };

     fetchRecord();
   }, [module, recordId]);

  return (
    <div className="App">
      <p className="App-title">{module}</p>
      <p className="App-title">{recordId}</p>
      <div>
        {recordDetails && (
          <div>
            <p>Record Details:</p>
            <ul>
              {Object.entries(recordDetails).map(([key, value]) => (
                <li key={key}>
                  <strong>{key}:</strong> {JSON.stringify(value)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
