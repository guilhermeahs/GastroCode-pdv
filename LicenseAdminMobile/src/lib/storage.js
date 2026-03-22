import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const KEY_PRIVATE_PEM = "hadassa_mobile_private_pem";
const KEY_PIN_HASH = "hadassa_mobile_pin_hash";
const KEY_HISTORY = "hadassa_mobile_history_v1";

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(String(raw || ""));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export async function loadPrivatePem() {
  const value = await SecureStore.getItemAsync(KEY_PRIVATE_PEM);
  return String(value || "");
}

export async function savePrivatePem(value) {
  await SecureStore.setItemAsync(KEY_PRIVATE_PEM, String(value || ""));
}

export async function clearPrivatePem() {
  await SecureStore.deleteItemAsync(KEY_PRIVATE_PEM);
}

export async function loadPinHash() {
  const value = await SecureStore.getItemAsync(KEY_PIN_HASH);
  return String(value || "");
}

export async function savePinHash(hash) {
  await SecureStore.setItemAsync(KEY_PIN_HASH, String(hash || ""));
}

export async function clearPinHash() {
  await SecureStore.deleteItemAsync(KEY_PIN_HASH);
}

export async function loadHistory() {
  const raw = await AsyncStorage.getItem(KEY_HISTORY);
  const parsed = safeJsonParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export async function saveHistory(items) {
  const value = Array.isArray(items) ? items.slice(0, 100) : [];
  await AsyncStorage.setItem(KEY_HISTORY, JSON.stringify(value));
}

export async function clearHistory() {
  await AsyncStorage.removeItem(KEY_HISTORY);
}
