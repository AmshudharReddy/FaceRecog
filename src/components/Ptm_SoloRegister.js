import React, { useState, useRef, useEffect } from "react";
import { QrReader } from "react-qr-reader";
import styles from './CSS_SoloRegister';

const Ptm_SoloRegister = (props) => {
  const [rollNo, setRollNo] = useState("");
  const [labelName, setLabelName] = useState("");
  const [numImages, setNumImages] = useState(15); // Default: 15 images
  const [errorMessage, setErrorMessage] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isQRScanning, setIsQRScanning] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);  // State to track the captured images count
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Handlers for the input fields
  const handleRollNoChange = (e) => setRollNo(e.target.value);
  const handleLabelNameChange = (e) => setLabelName(e.target.value);
  const handleNumImagesChange = (e) => setNumImages(e.target.value);

  // QR Code scanning functions
  const handleQRScan = (result) => {
    if (result) {
      const values = result.split(",");
      if (values.length >= 2) {
        setRollNo(values[0].trim());
        setLabelName(values[1].trim());
        setIsQRScanning(false);
        props.showAlert("QR Code scanned successfully!", "success");
      } else {
        setErrorMessage("Invalid QR code format. Please scan again.");
      }
    }
  };

  const handleQRError = (err) => {
    console.error("QR scanning error:", err);
    setErrorMessage("Failed to scan QR code. Please try again.");
  };

  const handleStartQRScanner = () => setIsQRScanning(true);
  const handleStopQRScanner = () => setIsQRScanning(false);

  // Start Camera
  const handleStartCamera = async () => {
    if (!videoRef.current) {
      console.error("Video element is not ready yet.");
      setErrorMessage("Camera could not be initialized. Please try again.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream; // Store the stream to stop it later
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setIsCameraActive(true);
      console.log("Camera started successfully.");
    } catch (err) {
      console.error("Camera access error details:", err);
      switch (err.labelName) {
        case "NotAllowedError":
          setErrorMessage(
            "Camera access is denied. Please enable it in your browser settings."
          );
          break;
        case "NotFoundError":
          setErrorMessage("No camera detected. Please connect a camera.");
          break;
        case "NotReadableError":
          setErrorMessage("Camera is being used by another application.");
          break;
        default:
          setErrorMessage("An unexpected error occurred. Please try again.");
      }
    }
  };

  // Stop Camera
  const handleStopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      const tracks = stream.getTracks(); // Get all media tracks
      tracks.forEach((track) => track.stop()); // Stop each track
      videoRef.current.srcObject = null; // Clear the video element's source
      streamRef.current = null; // Clear the stored stream reference
      setIsCameraActive(false);
      console.log("Camera stopped successfully!");
    } else {
      console.warn("Camera is already stopped or was never started.");
    }
  };

  // Register Face
  const handleRegisterFace = async () => {
    if (!rollNo || !labelName) {
      setErrorMessage("Roll number, and label name are required.");
      return;
    }
    if (numImages <= 0 || numImages === "") {
      setErrorMessage("Number of images must be greater than 0");
      return;
    }
    if (!isCameraActive) {
      setErrorMessage("Please start the camera before registering");
      return;
    }

    setErrorMessage(""); // Clear previous errors

    const capturedFaceEncodings = []; // Store face encodings
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    let attemptCount = 0; // Track the total number of attempts
    try {
      // Continue capturing until the required number of images is reached
      while (capturedFaceEncodings.length < numImages) {
        try {
          setErrorMessage(""); // Clear error message for each attempt
          attemptCount++;

          // Capture image from video stream
          context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const imageData = canvas.toDataURL("image/jpeg"); // Base64-encoded image

          // Send the captured image to the server to generate the face encoding
          const response = await fetch("http://localhost:5001/api/face/generate-embeddings-ptm", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              frame: imageData, // Send base64 image
            }),
          });

          console.log(`Attempt ${attemptCount}: Sent frame to Python`);
          const result = await response.json();

          if (result.faceDetected) {
            // Add the detected face encoding
            capturedFaceEncodings.push(result.faceEncoding);
            setCapturedCount(capturedFaceEncodings.length); // Update the captured count
            console.log(`Face encoding generated (${capturedFaceEncodings.length}/${numImages})`);
          } else {
            console.log(`No face detected in attempt ${attemptCount}. Retrying...`);
            setErrorMessage("No face detected, continuing...");
          }

          // Add a delay for better variance between captures
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          console.error("Error while capturing face:", error);
          setErrorMessage("Error capturing face. Retrying...");
        }
      }

      console.log("Required number of face images captured successfully.");

      // Calculate the average face encoding
      const averageFaceEncoding = calculateAverageEmbedding(capturedFaceEncodings);

      const data = {
        label: labelName,
        rollNo: rollNo,
        faceEncoding: averageFaceEncoding,
      };
      // console.log(data.faceEncoding);

      // Ensure you are getting the token from sessionStorage
      const token = sessionStorage.getItem("token");
      if (!token) {
        setErrorMessage("Authentication token missing. Please log in.");
        return;
      }

      // Send the data to the backend with the token in the headers
      const response = await fetch("http://localhost:5000/api/face/register-face-ptm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "auth-token": token, // Include the token in the request header
        },
        body: JSON.stringify(data), // Send face encodings and label
      });
      console.log("Sent embedding to Backend");

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          props.showAlert(`${labelName} registered successfully!`, 'info');
        } else {
          console.error(result.message);
          setErrorMessage(result.message);
        }
      } else {
        // Handle non-200 responses
        const errorText = await response.text();
        console.error("Error from server:", errorText);
        setErrorMessage("Failed to register face. Please try again.");
      }
    } catch (error) {
      console.error("Error during face registration:", error);
      setErrorMessage("Failed to register face. Please try again.");
    }
  };

  // Function to calculate the average of the face embeddings
  const calculateAverageEmbedding = (embeddings) => {
    const numDimensions = embeddings[0].length;  // Assuming all embeddings have the same length
    const average = new Array(numDimensions).fill(0);  // Initialize an array of zeros

    // Sum all embeddings for each dimension
    embeddings.forEach(embedding => {
      embedding.forEach((value, index) => {
        average[index] += value;
      });
    });

    // Calculate the average for each dimension
    return average.map(sum => sum / embeddings.length);
  };



  // Ensure videoRef is ready when `isCameraActive` changes
  useEffect(() => {
    if (isCameraActive && videoRef.current) {
      handleStartCamera();
    }
    return () => {
      if (isCameraActive) {
        handleStopCamera();
      }
    };
  }, [isCameraActive]);

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Individual Face Registration [PTM]</h1>

      <div style={styles.card}>
        {/* QR Code Scanner Section */}
        <button
          onClick={isQRScanning ? handleStopQRScanner : handleStartQRScanner}
          style={styles.button}
        >
          {isQRScanning ? "Stop QR Scanner" : "Scan QR Code"}
        </button>

        {isQRScanning && (
          <QrReader
            onResult={(result, error) => {
              if (result) handleQRScan(result.text);
              if (error) handleQRError(error);
            }}
            style={{ width: "100%" }}
          />
        )}

        {/* Input Fields */}
        <input
          type="text"
          placeholder="Enter Roll Number"
          value={rollNo}
          onChange={handleRollNoChange}
          style={styles.input}
        />
        <input
          type="text"
          placeholder="Enter Label Name"
          value={labelName}
          onChange={handleLabelNameChange}
          style={styles.input}
        />
        <input
          type="number"
          placeholder="Number of Images (default: 15)"
          value={numImages}
          onChange={handleNumImagesChange}
          style={styles.input}
        />

        {/* Error Message */}
        {errorMessage && <div style={styles.errorMessage}>{errorMessage}</div>}

        {/* Camera View */}
        <div style={styles.cameraContainer}>
          {isCameraActive ? (
            <video ref={videoRef} style={styles.video} autoPlay muted />
          ) : (
            <div style={styles.placeholder}>Camera is off</div>
          )}
        </div>

        {/* Image Count Section */}
        <div style={styles.imageCountContainer}>
          <p style={styles.imageCountText}>
            Images Captured: {capturedCount}/{numImages}
          </p>
        </div>

        {/* Button Section */}
        <div style={styles.buttonsRow}>
          <button
            onClick={handleStartCamera}
            style={styles.button}
            disabled={isCameraActive}
          >
            Start Camera
          </button>
          <button
            onClick={handleStopCamera}
            style={{ ...styles.button, backgroundColor: "#d40707d8" }}
            disabled={!isCameraActive}
          >
            Stop Camera
          </button>
          <button
            onClick={handleRegisterFace}
            style={{ ...styles.button, backgroundColor: "teal" }}
          >
            Register Face
          </button>
        </div>
      </div>
    </div>
  );
};


export default Ptm_SoloRegister;
