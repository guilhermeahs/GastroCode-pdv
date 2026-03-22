import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { sha256 } from "js-sha256";
import {
  buildLicenseToken,
  publicFingerprintFromPrivatePem
} from "./src/lib/license";
import {
  clearHistory,
  clearPinHash,
  clearPrivatePem,
  loadHistory,
  loadPinHash,
  loadPrivatePem,
  saveHistory,
  savePinHash,
  savePrivatePem
} from "./src/lib/storage";

const DEFAULT_FORM = {
  customer: "",
  device_id: "",
  plan: "MENSAL",
  days: "30",
  offline_days: "7"
};

function PrimaryButton({ title, onPress, disabled = false, danger = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        danger ? styles.buttonDanger : styles.buttonPrimary,
        disabled && styles.buttonDisabled
      ]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder = "",
  multiline = false,
  secureTextEntry = false,
  keyboardType = "default"
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#7f88ac"
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

function formatDate(value) {
  if (!value) return "Sem expiracao";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [privatePem, setPrivatePem] = useState("");
  const [pemDraft, setPemDraft] = useState("");
  const [pinHash, setPinHash] = useState("");
  const [unlockPin, setUnlockPin] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [token, setToken] = useState("");
  const [payload, setPayload] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    async function bootstrap() {
      const [pemValue, pinHashValue, historyValue] = await Promise.all([
        loadPrivatePem(),
        loadPinHash(),
        loadHistory()
      ]);

      setPrivatePem(pemValue);
      setPemDraft(pemValue);
      setPinHash(pinHashValue);
      setUnlocked(!pinHashValue);
      setHistory(Array.isArray(historyValue) ? historyValue : []);
      setReady(true);
    }

    bootstrap().catch(() => {
      setReady(true);
    });
  }, []);

  const fingerprint = useMemo(() => {
    if (!privatePem) return "";
    try {
      return publicFingerprintFromPrivatePem(privatePem);
    } catch {
      return "";
    }
  }, [privatePem]);

  async function handleSavePrivatePem() {
    const value = String(pemDraft || "").trim();
    if (!value) {
      Alert.alert("Chave vazia", "Cole uma chave privada no formato PEM.");
      return;
    }

    try {
      publicFingerprintFromPrivatePem(value);
    } catch (error) {
      Alert.alert("Chave invalida", error.message || "Formato nao suportado.");
      return;
    }

    await savePrivatePem(value);
    setPrivatePem(value);
    Alert.alert("Sucesso", "Chave privada salva com seguranca neste dispositivo.");
  }

  async function handleClearPrivatePem() {
    await clearPrivatePem();
    setPrivatePem("");
    setPemDraft("");
    Alert.alert("Removida", "Chave privada removida do app.");
  }

  async function handleSetPin() {
    const pin = String(pinInput || "").trim();
    const confirm = String(pinConfirm || "").trim();
    if (!/^\d{4,8}$/.test(pin)) {
      Alert.alert("PIN invalido", "Use de 4 a 8 numeros.");
      return;
    }
    if (pin !== confirm) {
      Alert.alert("PIN invalido", "PIN e confirmacao estao diferentes.");
      return;
    }

    const hash = sha256(pin);
    await savePinHash(hash);
    setPinHash(hash);
    setUnlocked(true);
    setPinInput("");
    setPinConfirm("");
    setUnlockPin("");
    Alert.alert("PIN salvo", "Protecao ativada.");
  }

  async function handleClearPin() {
    await clearPinHash();
    setPinHash("");
    setUnlocked(true);
    setUnlockPin("");
    Alert.alert("PIN removido", "Protecao por PIN foi desativada.");
  }

  function handleUnlock() {
    const hash = sha256(String(unlockPin || "").trim());
    if (!pinHash || hash !== pinHash) {
      Alert.alert("PIN incorreto", "Tente novamente.");
      return;
    }
    setUnlocked(true);
    setUnlockPin("");
  }

  async function handleGenerateToken() {
    if (!privatePem) {
      Alert.alert("Sem chave", "Salve a chave privada antes de gerar token.");
      return;
    }

    try {
      const nextPayload = {
        customer: form.customer,
        device_id: form.device_id,
        plan: form.plan || "MENSAL",
        days: Number(form.days || 0),
        offline_days: Number(form.offline_days || 7)
      };
      const result = buildLicenseToken(privatePem, nextPayload);
      setToken(result.token);
      setPayload(result.payload);

      const registro = {
        generated_at: new Date().toISOString(),
        payload: result.payload,
        token: result.token,
        token_preview: `${result.token.slice(0, 24)}...${result.token.slice(-24)}`
      };

      const newHistory = [registro, ...history].slice(0, 100);
      setHistory(newHistory);
      await saveHistory(newHistory);
      Alert.alert("Token gerado", "Licenca criada com sucesso.");
    } catch (error) {
      Alert.alert("Falha", error.message || "Nao foi possivel gerar o token.");
    }
  }

  async function handleCopyToken(value = token) {
    if (!value) return;
    await Clipboard.setStringAsync(String(value));
    Alert.alert("Copiado", "Token copiado para a area de transferencia.");
  }

  async function handleClearHistory() {
    await clearHistory();
    setHistory([]);
    Alert.alert("Historico limpo", "Lista de emissoes apagada.");
  }

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Carregando cofre...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!unlocked) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.lockWrap}>
          <Text style={styles.title}>Hadassa License Mobile</Text>
          <Text style={styles.subtitle}>Digite o PIN para liberar emissao de licencas.</Text>
          <LabeledInput
            label="PIN"
            value={unlockPin}
            onChangeText={setUnlockPin}
            placeholder="4 a 8 numeros"
            secureTextEntry
            keyboardType="number-pad"
          />
          <PrimaryButton title="Desbloquear" onPress={handleUnlock} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Hadassa License Mobile</Text>
        <Text style={styles.subtitle}>Emissor offline de licencas HB1 para o PDV.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status do cofre</Text>
          <Text style={styles.statusLine}>
            Chave privada: {privatePem ? "OK" : "NAO CONFIGURADA"}
          </Text>
          <Text style={styles.statusLine}>
            Fingerprint publica: {fingerprint || "-"}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Chave privada (PEM)</Text>
          <LabeledInput
            label="Cole a chave privada Ed25519 PKCS8"
            value={pemDraft}
            onChangeText={setPemDraft}
            placeholder="-----BEGIN PRIVATE KEY-----"
            multiline
          />
          <View style={styles.rowButtons}>
            <PrimaryButton title="Salvar chave" onPress={handleSavePrivatePem} />
            <PrimaryButton title="Apagar chave" onPress={handleClearPrivatePem} danger />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>PIN de protecao</Text>
          <LabeledInput
            label="Novo PIN (4-8 numeros)"
            value={pinInput}
            onChangeText={setPinInput}
            placeholder="1234"
            secureTextEntry
            keyboardType="number-pad"
          />
          <LabeledInput
            label="Confirmar PIN"
            value={pinConfirm}
            onChangeText={setPinConfirm}
            placeholder="1234"
            secureTextEntry
            keyboardType="number-pad"
          />
          <View style={styles.rowButtons}>
            <PrimaryButton title="Salvar PIN" onPress={handleSetPin} />
            {pinHash ? <PrimaryButton title="Remover PIN" onPress={handleClearPin} danger /> : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Emitir licenca</Text>
          <LabeledInput
            label="Cliente"
            value={form.customer}
            onChangeText={(customer) => setForm((prev) => ({ ...prev, customer }))}
            placeholder="Nome do cliente"
          />
          <LabeledInput
            label="Codigo do dispositivo"
            value={form.device_id}
            onChangeText={(device_id) => setForm((prev) => ({ ...prev, device_id: device_id.toUpperCase() }))}
            placeholder="PDV-1234ABCD5678EF90"
          />
          <LabeledInput
            label="Plano"
            value={form.plan}
            onChangeText={(plan) => setForm((prev) => ({ ...prev, plan: plan.toUpperCase() }))}
            placeholder="MENSAL"
          />
          <View style={styles.row}>
            <View style={styles.rowCol}>
              <LabeledInput
                label="Dias"
                value={form.days}
                onChangeText={(days) => setForm((prev) => ({ ...prev, days: days.replace(/\D/g, "") }))}
                placeholder="30"
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.rowCol}>
              <LabeledInput
                label="Offline days"
                value={form.offline_days}
                onChangeText={(offline_days) =>
                  setForm((prev) => ({ ...prev, offline_days: offline_days.replace(/\D/g, "") }))
                }
                placeholder="7"
                keyboardType="number-pad"
              />
            </View>
          </View>
          <PrimaryButton title="Gerar token" onPress={handleGenerateToken} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Token gerado</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline, styles.tokenInput]}
            value={token}
            editable={false}
            multiline
            placeholder="O token HB1 aparece aqui"
            placeholderTextColor="#7f88ac"
          />
          <PrimaryButton title="Copiar token" onPress={() => handleCopyToken(token)} disabled={!token} />
          {payload ? (
            <View style={styles.payloadBox}>
              <Text style={styles.payloadText}>ID: {payload.license_id}</Text>
              <Text style={styles.payloadText}>Dispositivo: {payload.device_id}</Text>
              <Text style={styles.payloadText}>Expira: {formatDate(payload.expires_at)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Historico local</Text>
          <View style={styles.rowButtons}>
            <PrimaryButton title="Limpar historico" onPress={handleClearHistory} danger />
          </View>
          {history.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma emissao registrada.</Text>
          ) : (
            history.map((item, index) => (
              <View key={`${item.generated_at}-${index}`} style={styles.historyItem}>
                <Text style={styles.historyTitle}>
                  {item?.payload?.customer || "-"} - {item?.payload?.plan || "-"}
                </Text>
                <Text style={styles.historyText}>Dispositivo: {item?.payload?.device_id || "-"}</Text>
                <Text style={styles.historyText}>Expira: {formatDate(item?.payload?.expires_at)}</Text>
                <Text style={styles.historyText}>Token: {item?.token_preview || "-"}</Text>
                <PrimaryButton
                  title="Copiar token"
                  onPress={() => handleCopyToken(item?.token)}
                  disabled={!item?.token}
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#070b17"
  },
  container: {
    padding: 16,
    paddingBottom: 44,
    gap: 12
  },
  title: {
    color: "#f7f9ff",
    fontSize: 30,
    fontWeight: "800"
  },
  subtitle: {
    color: "#a8b5de",
    marginBottom: 8
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2e3a63",
    backgroundColor: "#101734",
    padding: 12,
    gap: 10
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700"
  },
  statusLine: {
    color: "#dbe5ff"
  },
  fieldGroup: {
    gap: 6
  },
  label: {
    color: "#adc0f6",
    fontSize: 13
  },
  input: {
    borderWidth: 1,
    borderColor: "#3a4a7d",
    backgroundColor: "#0f1530",
    color: "#f7f9ff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  inputMultiline: {
    minHeight: 100,
    textAlignVertical: "top"
  },
  tokenInput: {
    minHeight: 130
  },
  button: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: "center"
  },
  buttonPrimary: {
    backgroundColor: "#2e63f4"
  },
  buttonDanger: {
    backgroundColor: "#7f2f3f"
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700"
  },
  row: {
    flexDirection: "row",
    gap: 10
  },
  rowCol: {
    flex: 1
  },
  rowButtons: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  payloadBox: {
    borderWidth: 1,
    borderColor: "#2f4b6f",
    borderRadius: 10,
    backgroundColor: "#0d1a33",
    padding: 10,
    gap: 4
  },
  payloadText: {
    color: "#c9d9ff"
  },
  historyItem: {
    borderWidth: 1,
    borderColor: "#2d3f67",
    borderRadius: 10,
    padding: 10,
    gap: 6,
    backgroundColor: "#0d142d"
  },
  historyTitle: {
    color: "#ffffff",
    fontWeight: "700"
  },
  historyText: {
    color: "#b8c8f2",
    fontSize: 12
  },
  emptyText: {
    color: "#9caacf"
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  loadingText: {
    color: "#d4dcff"
  },
  lockWrap: {
    flex: 1,
    padding: 16,
    justifyContent: "center",
    gap: 12
  }
});
