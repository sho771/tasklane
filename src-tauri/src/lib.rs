use encoding_rs::{EUC_JP, ISO_2022_JP, SHIFT_JIS};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize)]
struct MarkdownFileInput {
    #[serde(rename = "relativePath")]
    relative_path: String,
    content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownFileOutput {
    relative_path: String,
    content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SelectFolderResult {
    canceled: bool,
    path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SelectMarkdownFileResult {
    canceled: bool,
    path: Option<String>,
    relative_path: Option<String>,
    content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ListMarkdownResult {
    files: Vec<MarkdownFileOutput>,
    tag: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WriteMarkdownResult {
    written_count: usize,
    written_paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncMarkdownResult {
    written_count: usize,
    written_paths: Vec<String>,
    deleted_count: usize,
    deleted_paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppendLogResult {
    written: bool,
    relative_path: Option<String>,
}

fn to_posix_path(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().replace('\\', "/")
}

fn decode_markdown_buffer(bytes: &[u8]) -> String {
    if let Ok(text) = String::from_utf8(bytes.to_vec()) {
        return text;
    }

    for encoding in [SHIFT_JIS, EUC_JP, ISO_2022_JP] {
        let (decoded, _, had_errors) = encoding.decode(bytes);
        if !had_errors {
            return decoded.into_owned();
        }
    }

    String::from_utf8_lossy(bytes).into_owned()
}

fn split_frontmatter(content: &str) -> (String, String) {
    let normalized = content.replace("\r\n", "\n");
    if !normalized.starts_with("---\n") {
        return (String::new(), normalized);
    }

    if let Some(end) = normalized[4..].find("\n---\n") {
        let end_index = end + 4;
        return (
            normalized[4..end_index].to_string(),
            normalized[(end_index + 5)..].to_string(),
        );
    }

    (String::new(), normalized)
}

fn parse_meta_value(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}

fn parse_frontmatter_block(frontmatter: &str) -> HashMap<String, String> {
    frontmatter
        .lines()
        .filter_map(|line| {
            let index = line.find(':')?;
            if index == 0 {
                return None;
            }
            let key = line[..index].trim();
            if key.is_empty() {
                return None;
            }
            Some((key.to_string(), parse_meta_value(&line[(index + 1)..])))
        })
        .collect()
}

fn is_tasklane_markdown(content: &str) -> bool {
    let (frontmatter, _) = split_frontmatter(content);
    let meta = parse_frontmatter_block(&frontmatter);
    matches!(
        meta.get("taskkanri").map(|value| value.as_str()),
        Some("true")
    )
}

fn is_word_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

fn contains_tag(content: &str, tag: &str) -> bool {
    let normalized_tag = if tag.starts_with('#') {
        tag.to_string()
    } else {
        format!("#{tag}")
    }
    .to_lowercase();
    let content = content.to_lowercase();
    let needle = normalized_tag.as_bytes();
    let bytes = content.as_bytes();
    if needle.is_empty() || needle.len() > bytes.len() {
        return false;
    }

    bytes
        .windows(needle.len())
        .enumerate()
        .any(|(index, window)| {
            if window != needle {
                return false;
            }
            let before_ok = index == 0 || !is_word_byte(bytes[index - 1]);
            let after_index = index + needle.len();
            let after_ok = after_index >= bytes.len()
                || !is_word_byte(bytes[after_index])
                || bytes[after_index] == b'/';
            before_ok && after_ok
        })
}

fn collect_markdown_files(
    root_dir: &Path,
    relative_dir: &Path,
    tag: Option<&str>,
) -> Result<Vec<MarkdownFileOutput>, String> {
    let current_dir = root_dir.join(relative_dir);
    let entries = fs::read_dir(&current_dir)
        .map_err(|error| format!("Failed to read {}: {error}", current_dir.display()))?;
    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_name = entry.file_name();
        let file_name_string = file_name.to_string_lossy();
        if file_name_string.starts_with('.') {
            continue;
        }

        let child_relative = relative_dir.join(&file_name);
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_dir() {
            files.extend(collect_markdown_files(root_dir, &child_relative, tag)?);
            continue;
        }

        if file_type.is_file() && file_name_string.to_lowercase().ends_with(".md") {
            let full_path = root_dir.join(&child_relative);
            let raw = fs::read(&full_path)
                .map_err(|error| format!("Failed to read {}: {error}", full_path.display()))?;
            let content = decode_markdown_buffer(&raw);
            if tag.is_some_and(|value| !contains_tag(&content, value)) {
                continue;
            }
            files.push(MarkdownFileOutput {
                relative_path: to_posix_path(&child_relative),
                content,
            });
        }
    }

    Ok(files)
}

fn resolve_and_validate_path(root_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    if relative.is_absolute() {
        return Err(format!("Invalid relative path: {relative_path}"));
    }
    for component in relative.components() {
        if matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        ) {
            return Err(format!("Invalid relative path: {relative_path}"));
        }
    }
    Ok(root_dir.join(relative))
}

fn remove_empty_parent_directories(root_dir: &Path, start_path: &Path) {
    let mut current_dir = match start_path.parent() {
        Some(parent) => parent.to_path_buf(),
        None => return,
    };

    while current_dir != root_dir {
        if !current_dir.starts_with(root_dir) {
            return;
        }
        if fs::remove_dir(&current_dir).is_err() {
            return;
        }
        current_dir = match current_dir.parent() {
            Some(parent) => parent.to_path_buf(),
            None => return,
        };
    }
}

#[tauri::command]
fn select_vault_folder() -> SelectFolderResult {
    match rfd::FileDialog::new()
        .set_title("Select Obsidian Vault Folder")
        .pick_folder()
    {
        Some(path) => SelectFolderResult {
            canceled: false,
            path: Some(path.to_string_lossy().to_string()),
        },
        None => SelectFolderResult {
            canceled: true,
            path: None,
        },
    }
}

#[tauri::command]
fn list_markdown_files(
    vault_path: String,
    tag: Option<String>,
) -> Result<ListMarkdownResult, String> {
    if vault_path.trim().is_empty() {
        return Err("vaultPath is required".to_string());
    }

    let resolved_vault = PathBuf::from(vault_path.trim());
    if !resolved_vault.is_dir() {
        return Err("vaultPath is not a directory".to_string());
    }

    let tag = tag.unwrap_or_default().trim().to_string();
    let files = collect_markdown_files(
        &resolved_vault,
        Path::new(""),
        if tag.is_empty() {
            None
        } else {
            Some(tag.as_str())
        },
    )?;

    Ok(ListMarkdownResult { files, tag })
}

#[tauri::command]
fn select_markdown_file(vault_path: Option<String>) -> Result<SelectMarkdownFileResult, String> {
    let vault_path = vault_path.unwrap_or_default();
    let mut dialog = rfd::FileDialog::new()
        .set_title("Select Markdown File")
        .add_filter("Markdown", &["md", "markdown"]);
    if !vault_path.trim().is_empty() {
        dialog = dialog.set_directory(vault_path.trim());
    }

    let Some(selected_path) = dialog.pick_file() else {
        return Ok(SelectMarkdownFileResult {
            canceled: true,
            path: None,
            relative_path: None,
            content: String::new(),
        });
    };

    let raw = fs::read(&selected_path)
        .map_err(|error| format!("Failed to read {}: {error}", selected_path.display()))?;
    let content = decode_markdown_buffer(&raw);
    let mut relative_path = selected_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "Selected.md".to_string());

    if !vault_path.trim().is_empty() {
        let vault = PathBuf::from(vault_path.trim());
        if let Ok(relative) = selected_path.strip_prefix(&vault) {
            relative_path = to_posix_path(relative);
        }
    }

    Ok(SelectMarkdownFileResult {
        canceled: false,
        path: Some(selected_path.to_string_lossy().to_string()),
        relative_path: Some(relative_path),
        content,
    })
}

#[tauri::command]
fn write_markdown_files(
    vault_path: String,
    files: Vec<MarkdownFileInput>,
) -> Result<WriteMarkdownResult, String> {
    if vault_path.trim().is_empty() {
        return Err("vaultPath is required".to_string());
    }

    let resolved_vault = PathBuf::from(vault_path.trim());
    fs::create_dir_all(&resolved_vault)
        .map_err(|error| format!("Failed to create {}: {error}", resolved_vault.display()))?;

    let mut written_paths = Vec::new();
    for file in files {
        let relative_path = file.relative_path.trim().replace('\\', "/");
        if relative_path.is_empty() || !relative_path.to_lowercase().ends_with(".md") {
            continue;
        }

        let target_path = resolve_and_validate_path(&resolved_vault, &relative_path)?;
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
        }
        fs::write(&target_path, file.content)
            .map_err(|error| format!("Failed to write {}: {error}", target_path.display()))?;
        written_paths.push(relative_path);
    }

    Ok(WriteMarkdownResult {
        written_count: written_paths.len(),
        written_paths,
    })
}

#[tauri::command]
fn sync_markdown_files(
    vault_path: String,
    files: Vec<MarkdownFileInput>,
    delete_stale_managed: bool,
) -> Result<SyncMarkdownResult, String> {
    let written = write_markdown_files(vault_path.clone(), files)?;
    let mut deleted_paths = Vec::new();

    if delete_stale_managed {
        let resolved_vault = PathBuf::from(vault_path.trim());
        let active_paths: std::collections::HashSet<String> =
            written.written_paths.iter().cloned().collect();
        let markdown_files = collect_markdown_files(&resolved_vault, Path::new(""), None)?;

        for file in markdown_files {
            if active_paths.contains(&file.relative_path) || !is_tasklane_markdown(&file.content) {
                continue;
            }
            let target_path = resolve_and_validate_path(&resolved_vault, &file.relative_path)?;
            fs::remove_file(&target_path)
                .map_err(|error| format!("Failed to delete {}: {error}", target_path.display()))?;
            remove_empty_parent_directories(&resolved_vault, &target_path);
            deleted_paths.push(file.relative_path);
        }
    }

    Ok(SyncMarkdownResult {
        written_count: written.written_count,
        written_paths: written.written_paths,
        deleted_count: deleted_paths.len(),
        deleted_paths,
    })
}

#[tauri::command]
fn append_vault_log(vault_path: String, entry: String) -> Result<AppendLogResult, String> {
    if vault_path.trim().is_empty() {
        return Err("vaultPath is required".to_string());
    }
    if entry.trim().is_empty() {
        return Ok(AppendLogResult {
            written: false,
            relative_path: None,
        });
    }

    let resolved_vault = PathBuf::from(vault_path.trim());
    fs::create_dir_all(&resolved_vault)
        .map_err(|error| format!("Failed to create {}: {error}", resolved_vault.display()))?;
    let relative_path = ".log/vault_log.log";
    let log_path = resolve_and_validate_path(&resolved_vault, relative_path)?;
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }
    let line = entry.replace(['\r', '\n'], " ").trim().to_string();
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut file| {
            use std::io::Write;
            writeln!(file, "{line}")
        })
        .map_err(|error| format!("Failed to append {}: {error}", log_path.display()))?;

    Ok(AppendLogResult {
        written: true,
        relative_path: Some(relative_path.to_string()),
    })
}

#[tauri::command]
fn log_renderer(app: AppHandle, level: String, message: String) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&log_dir).map_err(|error| error.to_string())?;
    let log_path = log_dir.join("taskkanri-main.log");
    let entry = format!(
        "[{}] renderer:{} {}\n\n",
        chrono_like_timestamp(),
        level,
        message
    );
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .and_then(|mut file| {
            use std::io::Write;
            file.write_all(entry.as_bytes())
        })
        .map_err(|error| error.to_string())
}

fn chrono_like_timestamp() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| format!("unix-ms:{}", duration.as_millis()))
        .unwrap_or_else(|_| "unix-ms:0".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            select_vault_folder,
            list_markdown_files,
            select_markdown_file,
            write_markdown_files,
            sync_markdown_files,
            append_vault_log,
            log_renderer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
