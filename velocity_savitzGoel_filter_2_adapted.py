import cv2 as cv
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

from collections import deque
from scipy.signal import savgol_filter
from scipy.stats import norm


# File paths
video_path = "overlay_t1.avi"
excel_path = "eye.xyPos - Copy.xlsx"


# Open video first
video = cv.VideoCapture(video_path)


# Conditional statement if video fails
if not video.isOpened():
    raise RuntimeError(f"Could not open {video_path}")


# Read video metadata
frame_width = int(video.get(cv.CAP_PROP_FRAME_WIDTH))
frame_height = int(video.get(cv.CAP_PROP_FRAME_HEIGHT))
frame_rate = video.get(cv.CAP_PROP_FPS)
frame_count = int(video.get(cv.CAP_PROP_FRAME_COUNT))

print(f"Resolution: {frame_width} x {frame_height}")
print(f"Frame rate: {frame_rate:.2f} FPS")
print(f"Frame count: {frame_count}")


# Established Variables
# Use the FPS reported by the video.
# If it is unavailable, use the previously measured value of 41.8 FPS.
fps = frame_rate if frame_rate > 0 else 41.8
dt = 1 / fps
trial_length = 10


# Maximum number of consecutive missing frames to interpolate
maximum_interpolation_gap = 2


# Savitzky-Golay parameters
sg_window_length = 5
sg_polyorder = 2


# Check Savitzky-Golay parameters
if sg_window_length % 2 == 0:
    video.release()

    raise ValueError(
        "Savitzky-Golay window length must be odd."
    )

if sg_polyorder >= sg_window_length:
    video.release()

    raise ValueError(
        "Savitzky-Golay polyorder must be smaller "
        "than the window length."
    )


# Open excel and access each of the columns as a vector

## Create data frame from excel file
df = pd.read_excel(excel_path)

# Reset the index so each row corresponds directly to a frame number
df = df.reset_index(drop=True)


# Check that the required columns exist
required_columns = [
    "X_Position",
    "Y_Position"
]

missing_columns = [
    column
    for column in required_columns
    if column not in df.columns
]

if missing_columns:
    video.release()

    raise KeyError(
        f"Missing spreadsheet columns: {missing_columns}"
    )


# Convert coordinate columns to numeric values.
# Invalid cells are converted to NaN.
df["X_Position"] = pd.to_numeric(
    df["X_Position"],
    errors="coerce"
)

df["Y_Position"] = pd.to_numeric(
    df["Y_Position"],
    errors="coerce"
)


# A frame is originally valid only when both coordinates are available
df["coordinate_originally_valid"] = (
    df["X_Position"].notna()
    & df["Y_Position"].notna()
)

original_missing_count = int(
    (~df["coordinate_originally_valid"]).sum()
)

print(
    "Frames with originally missing coordinates: "
    f"{original_missing_count}"
)


# Function for interpolating only complete short gaps
def interpolate_short_gaps(series, maximum_gap):
    """
    Interpolate only internal NaN runs whose complete length is
    less than or equal to maximum_gap.

    Longer gaps and gaps at the beginning or end remain NaN.
    """

    series = series.copy()

    missing = series.isna()

    # Give each continuous valid or missing region an ID
    group_id = missing.ne(
        missing.shift(fill_value=False)
    ).cumsum()

    # Calculate the size of each continuous region
    group_size = missing.groupby(
        group_id
    ).transform("sum")

    # Create a version with every internal gap interpolated
    completely_interpolated = series.interpolate(
        method="linear",
        limit_area="inside"
    )

    # Select only NaN samples belonging to sufficiently short gaps
    short_gap_mask = (
        missing
        & (group_size <= maximum_gap)
    )

    # Fill only the selected short gaps
    series.loc[short_gap_mask] = (
        completely_interpolated.loc[short_gap_mask]
    )

    return series


# Interpolate short coordinate gaps without deleting rows
df["X_Position_filled"] = interpolate_short_gaps(
    df["X_Position"],
    maximum_interpolation_gap
)

df["Y_Position_filled"] = interpolate_short_gaps(
    df["Y_Position"],
    maximum_interpolation_gap
)


# Identify frames where interpolation was used
df["coordinate_interpolated"] = (
    ~df["coordinate_originally_valid"]
    & df["X_Position_filled"].notna()
    & df["Y_Position_filled"].notna()
)


# A coordinate is usable only when both filled values are available
df["coordinate_usable"] = (
    df["X_Position_filled"].notna()
    & df["Y_Position_filled"].notna()
)

interpolated_count = int(
    df["coordinate_interpolated"].sum()
)

remaining_missing_count = int(
    (~df["coordinate_usable"]).sum()
)

print(
    f"Frames interpolated: {interpolated_count}"
)

print(
    "Frames remaining invalid after interpolation: "
    f"{remaining_missing_count}"
)


### Obtaining the velocity values itself

# Extract the filled X and Y columns as a NumPy matrix
pupil_positions = df[
    [
        "X_Position_filled",
        "Y_Position_filled"
    ]
].to_numpy(dtype=np.float64)


# Calculate raw velocity in pixels per second
df["vx"] = (
    df["X_Position_filled"].diff() / dt
)

df["vy"] = (
    df["Y_Position_filled"].diff() / dt
)

df["resultant_v"] = np.hypot(
    df["vx"],
    df["vy"]
)


# So when considering the savgol_filter we have to factor for the following variables:
# x - Variable to be filtered
# window_length - Number of samples inside each local fitting window
# polyorder - Degree of the polynomial fitted inside the window
# deriv - Degree of derivation to the polynomial
# delta - Spacing of the samples to which the filter will be added
# axis - Axis along which the filter is applied
# mode - Determines how the edges of the signal are handled
# cval - Constant value used when mode="constant"


# Function to apply Savitzky-Golay only to continuous valid segments
def segmented_savgol_derivative(
    values,
    valid_mask,
    window_length,
    polyorder,
    delta
):
    """
    Calculate a Savitzky-Golay derivative separately inside
    each continuous valid segment.

    Long missing sections remain NaN and do not contaminate
    neighbouring valid data.
    """

    values = np.asarray(
        values,
        dtype=np.float64
    )

    valid_mask = np.asarray(
        valid_mask,
        dtype=bool
    )

    derivative = np.full(
        values.shape,
        np.nan,
        dtype=np.float64
    )

    sample_count = len(values)
    start = 0

    while start < sample_count:

        # Skip invalid samples
        if not valid_mask[start]:
            start += 1
            continue

        # Find the end of the current continuous valid segment
        end = start

        while (
            end < sample_count
            and valid_mask[end]
        ):
            end += 1

        segment = values[start:end]
        segment_length = len(segment)

        # Apply Savitzky-Golay only when enough samples exist
        if segment_length >= window_length:
            derivative[start:end] = savgol_filter(
                x=segment,
                window_length=window_length,
                polyorder=polyorder,
                deriv=1,
                delta=delta,
                mode="interp"
            )

        # Short valid segments remain NaN because there are not
        # enough samples to perform the requested polynomial fit
        start = end

    return derivative


# Filtering and smoothening while calculating the derivative
coordinate_usable = df[
    "coordinate_usable"
].to_numpy(dtype=bool)

x_for_filtering = df[
    "X_Position_filled"
].to_numpy(dtype=np.float64)

y_for_filtering = df[
    "Y_Position_filled"
].to_numpy(dtype=np.float64)


df["vx_sg"] = segmented_savgol_derivative(
    values=x_for_filtering,
    valid_mask=coordinate_usable,
    window_length=sg_window_length,
    polyorder=sg_polyorder,
    delta=dt
)

df["vy_sg"] = segmented_savgol_derivative(
    values=y_for_filtering,
    valid_mask=coordinate_usable,
    window_length=sg_window_length,
    polyorder=sg_polyorder,
    delta=dt
)


# Resultant vector using the Savitzky-Golay filter
df["resultant_v_sg"] = np.hypot(
    df["vx_sg"],
    df["vy_sg"]
)


### Establishing the base velocity to be 0

# The first row has no previous position from which to calculate raw velocity
df.loc[
    df.index[0],
    ["vx", "vy", "resultant_v"]
] = 0.0


### Establishing dataframe with the resultant velocity vector

# Store the Savitzky-Golay resultant velocity as a NumPy vector
pupil_velocities = df[
    "resultant_v_sg"
].to_numpy(dtype=np.float64)


### Velocity Threshold Identification

# Extract only finite velocity measurements
finite_velocities = pupil_velocities[
    np.isfinite(pupil_velocities)
]

if finite_velocities.size == 0:
    video.release()

    raise ValueError(
        "No valid Savitzky-Golay velocity values were produced."
    )


# Fit a Gaussian distribution for visual purposes
gaussian_mean, gaussian_std = norm.fit(
    finite_velocities
)

if gaussian_std <= 0:
    video.release()

    raise ValueError(
        "The velocity standard deviation is zero. "
        "A threshold cannot be calculated."
    )


# Establish a five-standard-deviation velocity threshold
velocity_threshold = (
    gaussian_mean
    + 5 * gaussian_std
)


# Flag every valid sample which exceeds the velocity threshold
df["fast_movement_candidate"] = (
    df["resultant_v_sg"].notna()
    & (
        df["resultant_v_sg"]
        > velocity_threshold
    )
)


# Count all threshold-exceeding samples in the complete dataset
total_fast_samples = int(
    df["fast_movement_candidate"].sum()
)

print(f"Gaussian mean: {gaussian_mean:.2f} px/s")
print(f"Gaussian SD: {gaussian_std:.2f} px/s")
print(f"I-VT threshold: {velocity_threshold:.2f} px/s")
print(f"Total fast samples: {total_fast_samples}")


### Gaussian fitting

# The Gaussian distribution is used here for visualisation.
# Resultant speed is non-negative and is therefore not expected
# to follow a perfectly Gaussian distribution.
figure, axis = plt.subplots(
    figsize=(11, 6)
)

axis.hist(
    finite_velocities,
    bins=100,
    density=True,
    alpha=0.60,
    color="steelblue",
    label="Savitzky-Golay velocity"
)


# Create the fitted Gaussian curve
gaussian_x = np.linspace(
    finite_velocities.min(),
    finite_velocities.max(),
    1000
)

gaussian_y = norm.pdf(
    gaussian_x,
    gaussian_mean,
    gaussian_std
)

axis.plot(
    gaussian_x,
    gaussian_y,
    color="darkorange",
    linewidth=2,
    label="Gaussian fit"
)


# Display the velocity threshold on the distribution
axis.axvline(
    velocity_threshold,
    color="red",
    linestyle="--",
    linewidth=2,
    label=(
        f"I-VT threshold: "
        f"{velocity_threshold:.2f} px/s"
    )
)

axis.set_title(
    "Distribution of Savitzky-Golay Pupil Velocity"
)

axis.set_xlabel(
    "Resultant velocity (pixels/second)"
)

axis.set_ylabel(
    "Probability density"
)

axis.legend()
axis.grid(alpha=0.25)

plt.tight_layout()

# Display without preventing the OpenCV video from starting
plt.show(block=False)
plt.pause(0.1)


# Check whether the spreadsheet and video have matching frame counts
if len(df) != frame_count:
    print(
        "Warning: spreadsheet rows and video frames do not match.\n"
        f"Spreadsheet rows: {len(df)}\n"
        f"Video frames: {frame_count}"
    )


## We need to define the frame to have a center

# New ROI returned by cv.selectROI()
x = 665
y = 261
width = 192
height = 104

# Calculate the opposite corner
x2 = x + width
y2 = y + height


# Check that the ROI falls inside the video frame
if (
    x < 0
    or y < 0
    or x2 > frame_width
    or y2 > frame_height
):
    video.release()

    raise ValueError(
        "The selected ROI falls outside the video frame."
    )

print(f"ROI bounds: x={x}:{x2}, y={y}:{y2}")


# Store a short history of pupil centres for the trace
trace_duration_seconds = 2

trace_length = max(
    2,
    int(trace_duration_seconds * fps)
)

pupil_trace = deque(
    maxlen=trace_length
)


# Store velocity values for a scrolling graph
graph_duration_seconds = 10

graph_history_length = max(
    2,
    int(graph_duration_seconds * fps)
)

velocity_history = deque(
    maxlen=graph_history_length
)


# Graph dimensions
graph_width = 900
graph_height = 350

left_margin = 65
right_margin = 25
top_margin = 35
bottom_margin = 45


# Use a fixed vertical graph scale based on the 99th percentile.
# This prevents one extreme tracking error from flattening the graph.
graph_max_velocity = np.percentile(
    finite_velocities,
    99
)


# Ensure the threshold appears inside the live graph
graph_max_velocity = max(
    graph_max_velocity,
    velocity_threshold * 1.15,
    1.0
)

print(
    f"Velocity graph range: "
    f"0 to {graph_max_velocity:.2f} pixels/second"
)


frame_number = 0


# Count every displayed sample which exceeds the threshold
fast_sample_count = 0


# Count distinct fast-movement events
fast_event_count = 0


# Store whether the previous frame exceeded the threshold
previous_frame_was_fast = False


# Create resizable display windows
cv.namedWindow(
    "Full video",
    cv.WINDOW_NORMAL
)

cv.namedWindow(
    "Pupil ROI",
    cv.WINDOW_NORMAL
)

cv.namedWindow(
    "Pupil velocity",
    cv.WINDOW_NORMAL
)

cv.resizeWindow(
    "Full video",
    1000,
    700
)

cv.resizeWindow(
    "Pupil ROI",
    576,
    312
)

cv.resizeWindow(
    "Pupil velocity",
    graph_width,
    graph_height
)


# Loop to initialize the analysis of reading the frames
while True:
    ret, frame = video.read()

    if not ret:
        break


    # Stop if the video has more frames than coordinate rows
    if frame_number >= len(pupil_positions):
        print(
            "No more pupil-coordinate rows are available."
        )
        break


    # NumPy indexing order is [y, x]
    roi = frame[y:y2, x:x2]


    # Copy the frame so the original frame remains unchanged
    full_view = frame.copy()


    # Show where the ROI is located in the full frame
    cv.rectangle(
        full_view,
        (x, y),
        (x2, y2),
        (0, 255, 0),
        2
    )


    # Get the pupil centre for the current frame
    center_x = pupil_positions[
        frame_number,
        0
    ]

    center_y = pupil_positions[
        frame_number,
        1
    ]

    coordinate_is_valid = (
        np.isfinite(center_x)
        and np.isfinite(center_y)
    )

    coordinate_was_interpolated = bool(
        df.loc[
            frame_number,
            "coordinate_interpolated"
        ]
    )


    # Draw the centre only if the coordinate is valid
    if coordinate_is_valid:
        center = (
            int(round(center_x)),
            int(round(center_y))
        )


        # Confirm that the centre lies inside the video frame
        center_is_inside_frame = (
            0 <= center[0] < frame_width
            and 0 <= center[1] < frame_height
        )

        if center_is_inside_frame:
            pupil_trace.append(center)


            # Use orange for an interpolated coordinate
            if coordinate_was_interpolated:
                center_colour = (
                    0,
                    165,
                    255
                )

            else:
                center_colour = (
                    0,
                    0,
                    255
                )


            # Draw the current pupil centre
            cv.circle(
                full_view,
                center,
                5,
                center_colour,
                -1
            )


            # Draw a white border around the centre marker
            cv.circle(
                full_view,
                center,
                7,
                (255, 255, 255),
                1
            )

    else:
        # Prevent the trace from joining points across a long missing interval
        pupil_trace.clear()


    # Draw a trace along the previous pupil centres
    if len(pupil_trace) >= 2:
        trace_points = np.array(
            pupil_trace,
            dtype=np.int32
        ).reshape((-1, 1, 2))

        cv.polylines(
            full_view,
            [trace_points],
            isClosed=False,
            color=(0, 255, 255),
            thickness=2
        )


    # Obtain the velocity associated with the current frame
    current_velocity = pupil_velocities[
        frame_number
    ]


    # Determine whether the current sample exceeds the I-VT threshold
    current_frame_is_fast = (
        np.isfinite(current_velocity)
        and current_velocity > velocity_threshold
    )


    # Count the number of threshold-exceeding samples
    if current_frame_is_fast:
        fast_sample_count += 1


        # Count the start of a new fast-movement event
        if not previous_frame_was_fast:
            fast_event_count += 1


    # Store the state for comparison with the next frame
    previous_frame_was_fast = current_frame_is_fast


    if not np.isfinite(current_velocity):
        velocity_history.append(np.nan)

        velocity_text = (
            "Velocity: unavailable"
        )

        status_text = (
            "Status: invalid coordinate interval"
        )

        status_colour = (
            160,
            160,
            160
        )

    else:
        velocity_history.append(
            float(current_velocity)
        )

        velocity_text = (
            f"Velocity: "
            f"{current_velocity:.2f} px/s"
        )

        if current_frame_is_fast:
            status_text = (
                "FAST MOVEMENT CANDIDATE"
            )

            status_colour = (
                0,
                0,
                255
            )

        elif coordinate_was_interpolated:
            status_text = (
                "Interpolated coordinate"
            )

            status_colour = (
                0,
                165,
                255
            )

        else:
            status_text = (
                "Below threshold"
            )

            status_colour = (
                0,
                255,
                0
            )


    # Display velocity in the top-right corner
    font = cv.FONT_HERSHEY_SIMPLEX
    font_scale = 0.65
    text_thickness = 2

    panel_width = 460

    panel_x = max(
        10,
        frame_width - panel_width
    )


    # Draw a dark background behind the velocity information
    cv.rectangle(
        full_view,
        (panel_x - 10, 5),
        (frame_width - 10, 190),
        (0, 0, 0),
        -1
    )


    cv.putText(
        full_view,
        velocity_text,
        (panel_x, 35),
        font,
        font_scale,
        (0, 255, 255),
        text_thickness,
        cv.LINE_AA
    )


    cv.putText(
        full_view,
        (
            f"Threshold: "
            f"{velocity_threshold:.2f} px/s"
        ),
        (panel_x, 70),
        font,
        font_scale,
        (255, 255, 0),
        text_thickness,
        cv.LINE_AA
    )


    cv.putText(
        full_view,
        status_text,
        (panel_x, 105),
        font,
        font_scale,
        status_colour,
        text_thickness,
        cv.LINE_AA
    )


    cv.putText(
        full_view,
        f"Fast samples: {fast_sample_count}",
        (panel_x, 140),
        font,
        font_scale,
        (255, 255, 255),
        text_thickness,
        cv.LINE_AA
    )


    cv.putText(
        full_view,
        f"Fast events: {fast_event_count}",
        (panel_x, 175),
        font,
        font_scale,
        (255, 255, 255),
        text_thickness,
        cv.LINE_AA
    )


    cv.putText(
        full_view,
        f"ROI | Frame: {frame_number}",
        (x, max(25, y - 10)),
        cv.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 0),
        2,
        cv.LINE_AA
    )


    # Make the ROI border red during a fast-movement candidate
    if current_frame_is_fast:
        cv.rectangle(
            full_view,
            (x, y),
            (x2, y2),
            (0, 0, 255),
            3
        )


    # Create the live velocity graph
    graph = np.full(
        (
            graph_height,
            graph_width,
            3
        ),
        25,
        dtype=np.uint8
    )

    plot_left = left_margin
    plot_right = graph_width - right_margin
    plot_top = top_margin
    plot_bottom = graph_height - bottom_margin

    available_height = (
        plot_bottom - plot_top
    )


    # Draw graph axes
    cv.line(
        graph,
        (plot_left, plot_top),
        (plot_left, plot_bottom),
        (220, 220, 220),
        1
    )

    cv.line(
        graph,
        (plot_left, plot_bottom),
        (plot_right, plot_bottom),
        (220, 220, 220),
        1
    )


    # Add graph labels
    cv.putText(
        graph,
        f"{graph_max_velocity:.1f}",
        (5, plot_top + 5),
        cv.FONT_HERSHEY_SIMPLEX,
        0.5,
        (220, 220, 220),
        1,
        cv.LINE_AA
    )

    cv.putText(
        graph,
        "0",
        (35, plot_bottom + 5),
        cv.FONT_HERSHEY_SIMPLEX,
        0.5,
        (220, 220, 220),
        1,
        cv.LINE_AA
    )

    cv.putText(
        graph,
        "Velocity (pixels/second)",
        (plot_left, 22),
        cv.FONT_HERSHEY_SIMPLEX,
        0.6,
        (255, 255, 255),
        1,
        cv.LINE_AA
    )

    cv.putText(
        graph,
        f"Last {graph_duration_seconds} seconds",
        (
            plot_right - 175,
            graph_height - 12
        ),
        cv.FONT_HERSHEY_SIMPLEX,
        0.5,
        (220, 220, 220),
        1,
        cv.LINE_AA
    )


    # Draw the I-VT threshold on the live graph
    threshold_graph_y = int(
        plot_bottom
        - (
            velocity_threshold
            / graph_max_velocity
        )
        * available_height
    )

    cv.line(
        graph,
        (plot_left, threshold_graph_y),
        (plot_right, threshold_graph_y),
        (0, 0, 255),
        2,
        cv.LINE_AA
    )

    cv.putText(
        graph,
        (
            f"I-VT threshold: "
            f"{velocity_threshold:.1f}"
        ),
        (
            plot_left + 10,
            max(
                plot_top + 15,
                threshold_graph_y - 8
            )
        ),
        cv.FONT_HERSHEY_SIMPLEX,
        0.5,
        (0, 0, 255),
        1,
        cv.LINE_AA
    )


    # Convert the velocity history into graph points
    velocity_values = np.asarray(
        velocity_history,
        dtype=np.float64
    )

    if len(velocity_values) >= 2:
        graph_x = np.linspace(
            plot_left,
            plot_right,
            len(velocity_values)
        )

        clipped_velocity = np.clip(
            velocity_values,
            0,
            graph_max_velocity
        )

        graph_y = (
            plot_bottom
            - (
                clipped_velocity
                / graph_max_velocity
            )
            * available_height
        )


        # Draw individual valid line segments.
        # This avoids drawing across missing velocity values.
        for index in range(
            1,
            len(velocity_values)
        ):
            if (
                np.isfinite(graph_y[index - 1])
                and np.isfinite(graph_y[index])
            ):
                point_1 = (
                    int(graph_x[index - 1]),
                    int(graph_y[index - 1])
                )

                point_2 = (
                    int(graph_x[index]),
                    int(graph_y[index])
                )


                # Display threshold-exceeding segments in red
                if (
                    velocity_values[index]
                    > velocity_threshold
                ):
                    segment_colour = (
                        0,
                        0,
                        255
                    )

                else:
                    segment_colour = (
                        0,
                        255,
                        255
                    )


                cv.line(
                    graph,
                    point_1,
                    point_2,
                    segment_colour,
                    2,
                    cv.LINE_AA
                )


    # Display full-frame, cropped and velocity views
    cv.imshow(
        "Full video",
        full_view
    )

    cv.imshow(
        "Pupil ROI",
        roi
    )

    cv.imshow(
        "Pupil velocity",
        graph
    )


    frame_number += 1


    # Match video playback speed
    delay_ms = (
        max(
            1,
            round(1000 / fps)
        )
        if fps > 0
        else 30
    )


    # Press Q or Escape to stop
    key = cv.waitKey(
        delay_ms
    ) & 0xFF

    if (
        key == ord("q")
        or key == 27
    ):
        break


video.release()
cv.destroyAllWindows()
plt.close("all")


# Print the number of samples and events observed during playback
print(
    f"Displayed fast samples: "
    f"{fast_sample_count}"
)

print(
    f"Displayed fast-movement events: "
    f"{fast_event_count}"
)