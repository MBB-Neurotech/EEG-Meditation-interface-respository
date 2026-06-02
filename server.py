import asyncio
import json
import time
import websockets
from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds
from brainflow.data_filter import DataFilter, FilterTypes

# ── Board configuration ──────────────────────────────────────────────────────
# Native BLE path — uses the Mac's built-in Bluetooth, no dongle required.
BOARD_ID = BoardIds.GANGLION_NATIVE_BOARD.value
GANGLION_UUID = "EAA7AE5B-2DB3-0E02-907F-101AB1184EE2"   # your board's address

SAMPLE_RATE = BoardShim.get_sampling_rate(BOARD_ID)       # 200 Hz
EEG_ROWS = BoardShim.get_eeg_channels(BOARD_ID)           # correct row indices
NUM_CHANNELS = len(EEG_ROWS)                              # 4 for Ganglion


def build_board():
    """Native BLE connection — no serial port / dongle required."""
    params = BrainFlowInputParams()
    params.mac_address = GANGLION_UUID   # macOS CoreBluetooth UUID
    params.timeout = 15                  # seconds to search for the board
    return BoardShim(BOARD_ID, params)


def process_data(data):
    """
    Extract + filter EEG channels.
    1–50 Hz bandpass removes DC drift and high-frequency noise so the
    frontend gets clean, centered waveforms. Returns list-of-lists (µV).
    """
    channels = []
    for row in EEG_ROWS:
        signal = data[row].copy()
        DataFilter.perform_bandpass(
            signal,
            SAMPLE_RATE,
            1.0,    # low cutoff (Hz)
            50.0,   # high cutoff (Hz)
            4,      # filter order
            FilterTypes.BUTTERWORTH.value,
            0.0,    # ripple
        )
        channels.append(signal.tolist())
    return channels


async def stream_eeg(websocket, board):
    print("Frontend connected! Streaming data...")
    try:
        while True:
            data = board.get_board_data()  # pulls + clears the board buffer
            if data.shape[1] > 0:
                await websocket.send(json.dumps({
                    "eeg": process_data(data),
                    "channels": NUM_CHANNELS,
                    "sampleRate": SAMPLE_RATE,
                }))
            await asyncio.sleep(0.05)      # ~20 Hz poll
    except websockets.exceptions.ConnectionClosed:
        print("Frontend disconnected.")


async def runner(board):
    handler = lambda ws: stream_eeg(ws, board)
    print("Starting WebSocket server on ws://localhost:8080 ...")
    async with websockets.serve(handler, "localhost", 8080):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    BoardShim.enable_dev_board_logger()

    board = None
    prepared = False
    try:
        board = build_board()
        print("Connecting to Ganglion over native Bluetooth...")
        board.prepare_session()
        board.start_stream()
        prepared = True
        print(f"✅ CONNECTED — streaming {NUM_CHANNELS} channels @ {SAMPLE_RATE} Hz.")

        asyncio.run(runner(board))

    except KeyboardInterrupt:
        print("\nInterrupted by user.")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if board is not None and prepared:
            print("Shutting down board connection...")
            try:
                board.stop_stream()
                board.release_session()
            except Exception as e:
                print(f"Cleanup warning: {e}")