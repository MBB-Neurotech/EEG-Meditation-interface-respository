#!/usr/bin/env python3
"""
OpenBCI Ganglion → WebSocket bridge for neurotech-interface.

Usage:
  python3 main.py --lsl             # read from OpenBCI GUI LSL stream (recommended)
  python3 main.py --demo            # synthetic data, no hardware needed
  python3 main.py --port /dev/tty.usbmodem11  # connect directly (close OpenBCI GUI first)
"""

import asyncio
import json
import argparse
import time

import websockets

WS_PORT = 8765
CHUNK_INTERVAL = 0.05   # seconds between sends (~50 ms)

CLIENTS: set = set()


# ── LSL mode ───────────────────────────────────────────────────────────────
async def broadcast_loop_lsl():
    from pylsl import StreamInlet, resolve_streams

    print("Searching for any LSL stream...")
    all_streams = resolve_streams(wait_time=5.0)

    if not all_streams:
        print("[ERROR] No LSL streams found at all.")
        print("  • In OpenBCI GUI → Networking → LSL → TimeSeries → Start LSL Stream")
        return

    print(f"Found {len(all_streams)} stream(s):")
    for s in all_streams:
        print(f"  • name={s.name()}  type={s.type()}  channels={s.channel_count()}")

    # Use the first stream regardless of type
    inlet = StreamInlet(all_streams[0])
    info  = inlet.info()
    print(f"\nUsing: {info.name()}  |  {info.channel_count()} channels  |  {info.nominal_srate():.0f} Hz")
    print(f"WebSocket server →  ws://localhost:{WS_PORT}\n")

    while True:
        # pull_chunk returns (samples, timestamps)
        # samples shape: list of [ch1, ch2, ch3, ch4] per sample
        samples, _ = inlet.pull_chunk(timeout=0.0, max_samples=64)

        if samples and CLIENTS:
            # Transpose: [[s0_ch0, s0_ch1,...], [s1_ch0,...]] → [[ch0_s0,ch0_s1,...], [ch1_s0,...]]
            channels = [list(col) for col in zip(*samples)]
            websockets.broadcast(CLIENTS, json.dumps({
                "type": "eeg",
                "channels": channels,
                "timestamp": time.time(),
            }))

        await asyncio.sleep(CHUNK_INTERVAL)


# ── Brainflow mode (direct or demo) ───────────────────────────────────────
async def broadcast_loop_brainflow(serial_port: str, demo: bool):
    import numpy as np
    from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds

    BoardShim.disable_board_logger()
    params = BrainFlowInputParams()

    if demo:
        board_id = BoardIds.SYNTHETIC_BOARD.value
    else:
        board_id = BoardIds.GANGLION_BOARD.value
        params.serial_port = serial_port

    board = BoardShim(board_id, params)

    try:
        board.prepare_session()
    except Exception as e:
        print(f"\n[ERROR] Could not connect to board: {e}")
        print("  • Close the OpenBCI GUI first, then try again")
        print("  • Or run with --lsl to read from the OpenBCI GUI instead")
        print("  • Or run with --demo to use synthetic data")
        return

    board.start_stream()
    eeg_channels = BoardShim.get_eeg_channels(board_id)
    sample_rate  = BoardShim.get_sampling_rate(board_id)

    print(f"{'[DEMO] ' if demo else ''}Ganglion streaming at {sample_rate} Hz")
    print(f"WebSocket server →  ws://localhost:{WS_PORT}\n")

    while True:
        data = board.get_board_data()
        if data.shape[1] > 0 and CLIENTS:
            websockets.broadcast(CLIENTS, json.dumps({
                "type": "eeg",
                "channels": data[eeg_channels, :].tolist(),
                "timestamp": time.time(),
            }))
        await asyncio.sleep(CHUNK_INTERVAL)

    board.stop_stream()
    board.release_session()


# ── WebSocket handler ──────────────────────────────────────────────────────
async def handler(websocket):
    CLIENTS.add(websocket)
    print(f"Browser connected    (total: {len(CLIENTS)})")
    try:
        await websocket.wait_closed()
    finally:
        CLIENTS.discard(websocket)
        print(f"Browser disconnected (total: {len(CLIENTS)})")


# ── Entry point ────────────────────────────────────────────────────────────
async def main(args):
    if args.lsl:
        loop = broadcast_loop_lsl()
    else:
        loop = broadcast_loop_brainflow(args.port, args.demo)

    async with websockets.serve(handler, "localhost", WS_PORT):
        await loop


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OpenBCI Ganglion → WebSocket bridge")
    parser.add_argument("--lsl",  action="store_true", help="Read from OpenBCI GUI LSL stream")
    parser.add_argument("--demo", action="store_true", help="Synthetic data — no hardware needed")
    parser.add_argument("--port", default="/dev/tty.usbmodem11",
                        help="Serial port for direct brainflow connection")
    args = parser.parse_args()

    try:
        asyncio.run(main(args))
    except KeyboardInterrupt:
        print("\nShutdown.")
