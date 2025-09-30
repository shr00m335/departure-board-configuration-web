<script lang="ts">
	import USBSerial from '$lib/serial';
	import { lineNames, stations } from '$lib/tflData';

	let usbSerial: USBSerial | null = null;
	let ipAddress: string | null = null;
	let invertDisplay: boolean = false;
	let wifiSSID: string = '';
	let wifiPassword: string = '';
	let showPassword: boolean = false;
	let stationName: string = '';
	let selectedStationName: string = '';
	let selectedLineId: string = '';
	let isReadingLog: boolean = false;
	let logs: string[] = [];

	$: suggestedStationNames = Object.keys(stations).filter((x) =>
		x.toLowerCase().startsWith(stationName.toLowerCase())
	);

	$: availableLines = [...new Set(Object.values(stations[selectedStationName] || {}).flat())];

	const getLog = async (): Promise<void> => {
		if (usbSerial === null) return;
		console.log('Getting log');
		const text: string = await usbSerial.readLog();
		logs = [...logs, text];
		if (isReadingLog) {
			await getLog();
		}
	};

	const connectDevice = async (): Promise<void> => {
		try {
			usbSerial = await USBSerial.connect(115200);
			if (!(await usbSerial.handShake())) {
				alert('Failed to connect to device. Handshake failed!');
				usbSerial = null;
			}
			ipAddress = await usbSerial!.getIPAddress();
			wifiSSID = await usbSerial!.getWiFiSSID();
			wifiPassword = await usbSerial!.getWiFiPassword();
			const stationId: string = await usbSerial!.getStationId();
			stationName =
				Object.keys(stations).find((k) => Object.keys(stations[k]).includes(stationId)) ?? '';
			selectedStationName = stationName;
			selectedLineId = await usbSerial!.getLineId();
			invertDisplay = await usbSerial!.getRotation();
			isReadingLog = true;
			usbSerial?.startReadingLog();
			getLog();
		} catch (e) {
			if (typeof e === 'string') {
				alert(e.toUpperCase());
			} else if (e instanceof Error) {
				console.error(e);
			}
		}
	};

	const selectStation = (
		e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }
	): void => {
		stationName = e.currentTarget.textContent ?? '';
		selectedStationName = e.currentTarget.textContent ?? '';
	};

	const applyConfig = async (): Promise<void> => {
		if (usbSerial === null) return;
		isReadingLog = false;
		usbSerial.stopReadingLog();
		await usbSerial.echo([0x00]);
		await new Promise((r) => setTimeout(r, 100));
		if (!(await usbSerial.enterConfigMode())) {
			alert('Failed to apply configs: Failed to enter configuration mode');
			return;
		}
		if (!(await usbSerial.setWiFi(wifiSSID, wifiPassword))) {
			alert('Failed to apply configs: Failed to set WiFi');
			return;
		}
		const stationId: string | undefined = Object.keys(stations[selectedStationName]).find((x) =>
			stations[selectedStationName][x].includes(selectedLineId)
		);
		if (!stationId) {
			alert('Failed to apply configs: Failed to find station ID');
			return;
		}
		if (!(await usbSerial.setStation(stationId, selectedStationName))) {
			alert('Failed to apply configs: Failed to config station');
			return;
		}
		if (!(await usbSerial.setLine(selectedLineId))) {
			alert('Failed to apply configs: Failed to apply line');
			return;
		}
		if (!(await usbSerial.setRotation(invertDisplay))) {
			alert('Failed to apply configs: Failed to apply rotation');
			return;
		}
		await usbSerial.restartDevice();
		isReadingLog = true;
		usbSerial?.startReadingLog();
		getLog();
		alert('Successfully applied configs');
	};
</script>

<svelte:head>
	<title>Departure Board Config</title>
</svelte:head>

<main class="h-screen w-screen bg-white">
	<!-- Header -->
	<div class="flex h-14 w-full bg-[#0019A8] px-8">
		<h1 class="my-auto text-4xl text-white">Departure Board Configuration</h1>
	</div>
	<div class="grid h-4/5 grid-cols-2 px-8">
		<!-- Left -->
		<div class="flex flex-col">
			<!-- Device -->
			<div class="my-4">
				<p class="text-xl">
					Device: <span style={`color: ${usbSerial === null ? 'red' : 'green'}`}
						>{usbSerial === null ? 'Not Connected' : usbSerial!.getDeviceInfo()}</span
					>
				</p>
				<p class="text-xl">
					IP Address: <span
						>{ipAddress === null
							? 'Not Connected'
							: ipAddress.length === 0
								? 'Not connected to WiFi'
								: ipAddress}</span
					>
				</p>
				<button
					class="mt-2 rounded-xl bg-[#0019A8] px-16 py-1 text-xl text-white"
					on:click={connectDevice}>Connect</button
				>
			</div>
			<!-- Display Settings -->
			<div class="mt-3">
				<h3 class="text-2xl">Display Settings</h3>
				<div class="my-2 grid grid-cols-[140px_auto] gap-1">
					<p class="my-auto text-lg">Invert Display:</p>
					<input type="checkbox" bind:checked={invertDisplay} />
				</div>
			</div>
			<!-- WiFi Settings -->
			<div class="mt-3">
				<h3 class="text-2xl">WiFi Settings</h3>
				<div class="my-2 grid grid-cols-[140px_auto] gap-1">
					<p class="my-auto text-lg">WiFi SSID:</p>
					<input
						type="text"
						class="mr-2 rounded-xl bg-[#DFDFDF] px-2 py-1 text-lg"
						bind:value={wifiSSID}
					/>
					<p class="my-auto text-lg">WiFi Password:</p>
					<input
						type={showPassword ? 'text' : 'password'}
						class="mr-2 rounded-xl bg-[#DFDFDF] px-2 py-1 text-lg"
						bind:value={wifiPassword}
					/>
					<div></div>
					<div class="flex">
						<p>Show Password:</p>
						<input
							class="ml-2"
							type="checkbox"
							checked={showPassword}
							on:change={(e) => (showPassword = e.currentTarget.checked)}
						/>
					</div>
				</div>
			</div>
			<!-- Station Settings -->
			<div class="mt-3">
				<h3 class="text-2xl">Station Settings</h3>
				<div class="my-2 grid grid-cols-[140px_auto] gap-1">
					<p class="my-auto text-lg">Station:</p>
					<div class="relative w-full pr-2">
						<input
							type="text"
							class="mr-2 w-full rounded-xl bg-[#DFDFDF] px-2 py-1 text-lg"
							bind:value={stationName}
						/>
						{#if stationName.length > 0 && stationName !== selectedStationName}
							<div
								class="absolute z-10 mt-1 flex max-h-40 w-full flex-col overflow-y-auto rounded-xl bg-[#EFEFEF] py-1"
							>
								{#if suggestedStationNames.length > 0}
									{#each suggestedStationNames as station}
										<button
											class="cursor-pointer px-2 py-1 text-left hover:bg-black/10"
											on:click={selectStation}
										>
											{station}
										</button>
									{/each}
								{:else}
									<p class="cursor-default text-center text-gray-400">No Result</p>
								{/if}
							</div>
						{/if}
					</div>
					<p class="my-auto text-lg">Line:</p>
					<select
						class="mr-2 rounded-xl bg-[#DFDFDF] px-2 py-1.5 text-lg"
						disabled={selectedStationName.length === 0}
						bind:value={selectedLineId}
					>
						{#if stationName === selectedStationName}
							{#each availableLines as line}
								<option value={line} selected={selectedLineId === line}>{lineNames[line]}</option>
							{/each}
						{/if}
					</select>
				</div>
			</div>
			<button
				class="mt-12 mr-0 ml-auto rounded-xl bg-[#0019A8] px-16 py-1 text-xl text-white"
				on:click={applyConfig}>Apply</button
			>
		</div>
		<!-- Right -->
		<div class="mt-4 flex flex-col">
			<h1 class="ml-15 text-2xl">Logs</h1>
			<div class="mt-2 ml-auto h-full w-11/12 overflow-y-auto rounded-xl bg-[#EFEFEF] px-2 py-1">
				{#each logs as log}
					<p class="my-1 font-mono" style={`color: ${log.substring(0, 7)}`}>
						{log.substring(7)}
					</p>
				{/each}
			</div>
		</div>
	</div>
	<!-- WiFi Settings -->
</main>
