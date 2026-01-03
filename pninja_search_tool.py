import tkinter as tk
from tkinter import ttk, messagebox, filedialog, scrolledtext
import os
import re
import requests
import json
import csv
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import threading
import queue
import time

# --- Configuration ---
API_BASE_URL = "https://storeapi.parcelninja.com/api/v1"

# Mapping of Store IDs to friendly names
STORE_ID_TO_NAME = {
    "7b0fb2ac-51bd-47ea-847e-cfb1584b4aa2": "Diesel",
    "a504304c-ad27-4b9b-8625-92a314498e64": "Hurley",
    "80f123d6-f9de-45b9-938c-61c0a358f205": "Jeep Apparel",
    "b112948b-0390-4833-8f41-47f997c5382c": "Superdry",
    "963f57af-6f46-4d6d-b07c-dc4aa684cdfa": "Reebok",
}

@dataclass
class Store:
    """A dataclass to hold credentials and info for a single store."""
    id: str
    name: str
    username: str
    password: str

class ParcelninjaSearchTool(tk.Tk):
    """
    A GUI application for searching Parcelninja Inbounds and Outbounds.
    """
    def __init__(self, stores: List[Store]):
        super().__init__()
        self.stores = stores
        self.title("Parcelninja Search Tool")
        self.geometry("1400x900")

        if not self.stores:
            self.withdraw()
            messagebox.showerror(
                "Configuration Error",
                "No Parcelninja credentials found in environment variables.\n\n"
                "Please set variables like:\n"
                "PARCELNINJA_USER_<STORE_ID>=<username>\n"
                "PARCELNINJA_PASS_<STORE_ID>=<password>"
            )
            self.destroy()
            return

        self.results_data: List[Dict[str, Any]] = []
        self.api_queue = queue.Queue()
        self.stop_event = threading.Event()
        self.is_searching = False

        self._create_widgets()
        self.after(100, self.process_api_queue)

    def _create_widgets(self):
        # --- Main Layout ---
        # Top Control Panel
        top_frame = ttk.LabelFrame(self, text="Search Controls", padding="10")
        top_frame.pack(fill=tk.X, side=tk.TOP, padx=10, pady=5)

        # Content Area (Split into Results and Logs)
        content_pane = ttk.PanedWindow(self, orient=tk.VERTICAL)
        content_pane.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        # Results Frame
        results_frame = ttk.Labelframe(content_pane, text="Search Results", padding="10")
        content_pane.add(results_frame, weight=3)

        # Logger Frame
        log_frame = ttk.Labelframe(content_pane, text="System Logs", padding="10")
        content_pane.add(log_frame, weight=1)

        # Status Bar
        status_frame = ttk.Frame(self, padding="5")
        status_frame.pack(fill=tk.X, side=tk.BOTTOM)

        # --- Top Controls Details ---
        
        # Row 0: Configuration
        ttk.Label(top_frame, text="Store:").grid(row=0, column=0, padx=(0, 5), sticky="w")
        self.store_var = tk.StringVar()
        store_names = [s.name for s in self.stores]
        
        # CHANGED: Use Combobox instead of OptionMenu for better visibility/compatibility
        self.store_menu = ttk.Combobox(top_frame, textvariable=self.store_var, values=store_names, state="readonly")
        if store_names:
            self.store_menu.current(0)
        self.store_menu.grid(row=0, column=1, padx=5, sticky="ew")

        ttk.Label(top_frame, text="Search Type:").grid(row=0, column=2, padx=(20, 5), sticky="w")
        self.search_type_var = tk.StringVar(value="Outbound")
        ttk.Radiobutton(top_frame, text="Outbound", variable=self.search_type_var, value="Outbound", command=self._update_search_fields).grid(row=0, column=3, sticky="w")
        ttk.Radiobutton(top_frame, text="Inbound (Return)", variable=self.search_type_var, value="Inbound", command=self._update_search_fields).grid(row=0, column=4, sticky="w")

        # Row 1: Search Inputs
        ttk.Label(top_frame, text="Search By:").grid(row=1, column=0, padx=(0, 5), pady=10, sticky="w")
        self.search_field_var = tk.StringVar()
        
        # CHANGED: Use Combobox instead of OptionMenu
        self.search_field_menu = ttk.Combobox(top_frame, textvariable=self.search_field_var, state="readonly")
        self.search_field_menu.grid(row=1, column=1, padx=5, pady=10, sticky="ew")
        self._update_search_fields() # Initial population

        ttk.Label(top_frame, text="IDs/Terms:").grid(row=1, column=2, padx=(20, 5), pady=10, sticky="w")
        self.search_term_var = tk.StringVar()
        self.search_entry = ttk.Entry(top_frame, textvariable=self.search_term_var, width=50)
        self.search_entry.grid(row=1, column=3, columnspan=2, padx=5, pady=10, sticky="ew")
        self.search_entry.bind("<Return>", lambda event: self.start_search())
        
        # Row 1 Buttons
        button_frame = ttk.Frame(top_frame)
        button_frame.grid(row=1, column=5, padx=(10, 0), pady=10, sticky="e")

        self.search_button = ttk.Button(button_frame, text="Search", command=self.start_search)
        self.search_button.pack(side=tk.LEFT, padx=2)

        self.stop_button = ttk.Button(button_frame, text="Stop", command=self.stop_search, state="disabled")
        self.stop_button.pack(side=tk.LEFT, padx=2)

        self.refresh_button = ttk.Button(button_frame, text="Refresh / Reset", command=self.reset_ui)
        self.refresh_button.pack(side=tk.LEFT, padx=(10, 2))

        top_frame.grid_columnconfigure(3, weight=1)

        # --- Results Table ---
        self.tree = ttk.Treeview(results_frame, show="headings")
        vsb = ttk.Scrollbar(results_frame, orient="vertical", command=self.tree.yview)
        hsb = ttk.Scrollbar(results_frame, orient="horizontal", command=self.tree.xview)
        self.tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)

        self.tree.grid(row=0, column=0, sticky="nsew")
        vsb.grid(row=0, column=1, sticky="ns")
        hsb.grid(row=1, column=0, sticky="ew")

        results_frame.grid_rowconfigure(0, weight=1)
        results_frame.grid_columnconfigure(0, weight=1)

        # --- Logger Area ---
        self.log_text = scrolledtext.ScrolledText(log_frame, height=8, state='disabled', font=("Consolas", 9))
        self.log_text.pack(fill=tk.BOTH, expand=True)

        # --- Status Bar & Export ---
        self.status_label = ttk.Label(status_frame, text="Ready.", anchor="w")
        self.status_label.pack(side=tk.LEFT, fill=tk.X, expand=True)

        self.export_button = ttk.Button(status_frame, text="Export Results to CSV", command=self.export_to_csv, state="disabled")
        self.export_button.pack(side=tk.RIGHT)

    def log(self, message: str, level: str = "INFO"):
        """Adds a message to the logger window."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        formatted_msg = f"[{timestamp}] [{level}] {message}\n"
        
        self.log_text.config(state='normal')
        self.log_text.insert(tk.END, formatted_msg)
        self.log_text.see(tk.END)
        self.log_text.config(state='disabled')

    def _update_search_fields(self):
        """Update the search field dropdown based on Inbound/Outbound selection."""
        search_type = self.search_type_var.get()
        
        if search_type == "Outbound":
            fields = ["Client ID", "Channel ID"]
        else: # Inbound
            fields = ["Client ID", "Supplier Reference"]
        
        self.search_field_menu['values'] = fields
        if fields:
            self.search_field_menu.current(0)

    def reset_ui(self):
        """Hard resets the UI state."""
        if self.is_searching:
            self.stop_search()
            # Wait a brief moment for thread to react if needed, 
            # though usually we just want to clear immediately.
        
        self.search_term_var.set("")
        self.tree.delete(*self.tree.get_children())
        self.results_data = []
        
        self.log_text.config(state='normal')
        self.log_text.delete(1.0, tk.END)
        self.log_text.config(state='disabled')
        
        self.status_label.config(text="UI Reset. Ready.")
        self.export_button.config(state="disabled")
        self.search_button.config(state="normal")
        self.stop_button.config(state="disabled")
        
        self.log("Application reset.")

    def stop_search(self):
        """Signals the background thread to stop processing."""
        if self.is_searching:
            self.stop_event.set()
            self.log("Stopping search...", "WARN")
            self.stop_button.config(state="disabled")
            self.status_label.config(text="Stopping...")

    def start_search(self):
        """Initiates the API search in a background thread."""
        store_name = self.store_var.get()
        search_type = self.search_type_var.get().lower()
        search_field = self.search_field_var.get()
        search_terms_raw = self.search_term_var.get()

        if not search_terms_raw.strip():
            messagebox.showwarning("Input Required", "Please enter one or more search terms.")
            return

        # Split by comma or newline
        search_terms = [term.strip() for term in re.split(r'[,\n]', search_terms_raw) if term.strip()]
        selected_store = next((s for s in self.stores if s.name == store_name), None)

        if not selected_store:
            messagebox.showerror("Error", "Could not find selected store credentials.")
            return

        # UI State Updates
        self.is_searching = True
        self.stop_event.clear()
        self.search_button.config(state="disabled")
        self.stop_button.config(state="normal")
        self.refresh_button.config(state="disabled")
        self.export_button.config(state="disabled")
        self.tree.delete(*self.tree.get_children()) # Clear previous results
        self.results_data = []
        
        self.status_label.config(text=f"Searching in {store_name} for {len(search_terms)} term(s)...")
        self.log(f"Starting search in store '{store_name}' ({selected_store.id})")
        self.log(f"Type: {search_type}, Field: {search_field}, Terms: {len(search_terms)}")

        # Run the API calls in a separate thread
        thread = threading.Thread(
            target=self.run_api_search,
            args=(selected_store, search_type, search_field, search_terms)
        )
        thread.daemon = True
        thread.start()

    def run_api_search(self, store: Store, search_type: str, search_field: str, terms: List[str]):
        """The actual worker function that calls the API."""
        results = []
        
        total = len(terms)
        
        for index, term in enumerate(terms):
            # Check for stop signal
            if self.stop_event.is_set():
                self.api_queue.put({"type": "log", "msg": "Search stopped by user.", "level": "WARN"})
                break

            self.api_queue.put({"type": "log", "msg": f"Searching ({index+1}/{total}): {term}..."})

            try:
                found_for_term = False
                
                # Logic for Client ID direct lookup (faster/specific)
                if search_type == 'outbound' and search_field == 'Client ID':
                    url = f"{API_BASE_URL}/outbounds/0"
                    headers = {"Accept": "application/json", "X-Client-Id": term}
                    
                    self.api_queue.put({"type": "log", "msg": f"GET {url} [X-Client-Id: {term}]", "level": "DEBUG"})
                    
                    response = requests.get(url, headers=headers, auth=(store.username, store.password), timeout=20)
                    
                    if response.status_code == 200:
                        data = response.json()
                        # Tag with store name for the results table
                        data['_store_name'] = store.name 
                        results.append(data)
                        found_for_term = True
                    elif response.status_code == 404:
                         self.api_queue.put({"type": "log", "msg": f"Term '{term}' not found (404).", "level": "WARN"})
                    else:
                        error_msg = f"HTTP {response.status_code}: {response.text[:50]}"
                        self.api_queue.put({"type": "log", "msg": f"Error for '{term}': {error_msg}", "level": "ERROR"})
                
                else:
                    # General search logic for other fields
                    url = f"{API_BASE_URL}/{search_type}s" 
                    end_date = datetime.utcnow()
                    start_date = end_date - timedelta(days=730) # 2-year search window
                    
                    api_search_field = {
                        "Client ID": "clientId",
                        "Channel ID": "channelId",
                        "Supplier Reference": "supplierReference"
                    }.get(search_field, "search") 

                    params = {
                        "startDate": start_date.strftime('%Y%m%d'),
                        "endDate": end_date.strftime('%Y%m%d'),
                        "search": term,
                        "pageSize": 100 
                    }
                    
                    self.api_queue.put({"type": "log", "msg": f"GET {url} ?search={term}", "level": "DEBUG"})

                    response = requests.get(url, headers={"Accept": "application/json"}, params=params, auth=(store.username, store.password), timeout=30)
                    
                    if response.status_code == 200:
                        data = response.json()
                        found_items = data.get(f"{search_type}s", [])
                        if found_items:
                            for item in found_items:
                                item['_store_name'] = store.name
                                results.append(item)
                            found_for_term = True
                        else:
                            self.api_queue.put({"type": "log", "msg": f"Term '{term}' returned 0 results.", "level": "WARN"})
                    else:
                        self.api_queue.put({"type": "log", "msg": f"Error for '{term}': HTTP {response.status_code}", "level": "ERROR"})

                if not found_for_term:
                    # Add a placeholder result indicating failure
                    results.append({
                        'shipment_id_searched': term, 
                        'status_error': 'Not Found', 
                        '_store_name': store.name
                    })

            except requests.RequestException as e:
                self.api_queue.put({"type": "log", "msg": f"Exception for '{term}': {str(e)}", "level": "ERROR"})
                results.append({
                    'shipment_id_searched': term, 
                    'status_error': f"Network Error: {str(e)}", 
                    '_store_name': store.name
                })
        
        # Signal completion
        self.api_queue.put({"type": "done", "results": results})

    def process_api_queue(self):
        """Process messages from the API thread."""
        try:
            while True:
                msg = self.api_queue.get_nowait()
                
                if msg["type"] == "log":
                    self.log(msg["msg"], msg.get("level", "INFO"))
                
                elif msg["type"] == "done":
                    results = msg["results"]
                    self.results_data = results
                    self.update_results_table(results)
                    self.is_searching = False
                    self.search_button.config(state="normal")
                    self.stop_button.config(state="disabled")
                    self.refresh_button.config(state="normal")
                    
                    count = len([r for r in results if 'status_error' not in r])
                    self.status_label.config(text=f"Search complete. Found {count} valid record(s).")
                    
                    if results:
                        self.export_button.config(state="normal")
                    self.log(f"Search Finished. Total rows: {len(results)}")

        except queue.Empty:
            pass
        finally:
            self.after(100, self.process_api_queue)

    def update_results_table(self, results: List[Dict[str, Any]]):
        """Clears and repopulates the results table."""
        self.tree.delete(*self.tree.get_children())
        for col in self.tree["columns"]:
            self.tree.heading(col, text="")
        self.tree["columns"] = ()

        if not results:
            return

        # Flatten nested dicts
        flat_results = []
        all_headers = set()
        
        # We want 'Store' to be the first column
        all_headers.add('Store')
        
        for record in results:
            flat_record = self._flatten_dict(record)
            
            # Map the internal _store_name to a clean 'Store' key
            if '_store_name' in flat_record:
                flat_record['Store'] = flat_record.pop('_store_name')
            
            flat_results.append(flat_record)
            all_headers.update(flat_record.keys())
        
        # Sort headers: Store first, then everything else alphabetically
        sorted_headers = ['Store'] + sorted([h for h in all_headers if h != 'Store'])

        # Configure treeview columns
        self.tree["columns"] = sorted_headers
        for col in sorted_headers:
            self.tree.heading(col, text=col, anchor='w')
            # Adjust width based on column name length roughly
            width = max(len(col) * 10, 100)
            self.tree.column(col, anchor="w", width=width, stretch=tk.NO)

        # Populate data
        for record in flat_results:
            row_values = [record.get(col, "") for col in sorted_headers]
            # Optional: Tag rows with errors in red
            tag = 'normal'
            if 'status_error' in record and record['status_error']:
                tag = 'error'
            
            self.tree.insert("", "end", values=row_values, tags=(tag,))
        
        self.tree.tag_configure('error', foreground='red')

    def _flatten_dict(self, d: Dict[str, Any], parent_key: str = '', sep: str = '.') -> Dict[str, Any]:
        """Flattens a nested dictionary."""
        items = []
        for k, v in d.items():
            new_key = parent_key + sep + k if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, sep=sep).items())
            elif isinstance(v, list):
                items.append((new_key, json.dumps(v)))
            else:
                items.append((new_key, v))
        return dict(items)

    def export_to_csv(self):
        """Exports the current results to a CSV file."""
        if not self.results_data:
            messagebox.showinfo("No Data", "There is no data to export.")
            return

        filepath = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
            title="Save Results As"
        )
        if not filepath:
            return 

        try:
            # Re-flatten to ensure consistency
            flat_results = []
            for record in self.results_data:
                flat = self._flatten_dict(record)
                if '_store_name' in flat:
                    flat['Store'] = flat.pop('_store_name')
                flat_results.append(flat)

            all_headers = ['Store'] + sorted(list(set(key for record in flat_results for key in record.keys() if key != 'Store')))

            with open(filepath, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=all_headers)
                writer.writeheader()
                writer.writerows(flat_results)
            
            messagebox.showinfo("Success", f"Successfully exported data to:\n{filepath}")
            self.log(f"Data exported to {filepath}")

        except IOError as e:
            err_msg = f"Could not write to file: {e}"
            messagebox.showerror("Export Error", err_msg)
            self.log(err_msg, "ERROR")

def load_stores_from_env() -> List[Store]:
    """Loads all Parcelninja store credentials from environment variables."""
    stores = []
    user_pattern = re.compile(r"^PARCELNINJA_USER_(.+)$")

    for key, value in os.environ.items():
        match = user_pattern.match(key)
        if match:
            # Strip whitespace and lower case to match keys robustly
            store_id = match.group(1).strip()
            username = value
            password = os.environ.get(f"PARCELNINJA_PASS_{store_id}")
            
            if username and password:
                clean_id = store_id.lower()
                store_name = STORE_ID_TO_NAME.get(clean_id, f"Store ({store_id[:8]}...)")
                stores.append(Store(id=store_id, name=store_name, username=username, password=password))
    
    return sorted(stores, key=lambda s: s.name)

if __name__ == "__main__":
    loaded_stores = load_stores_from_env()
    app = ParcelninjaSearchTool(loaded_stores)
    app.mainloop()