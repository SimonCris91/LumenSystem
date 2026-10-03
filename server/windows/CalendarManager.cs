using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

internal static class CalendarManager
{
    private const string Root = @"C:\LumenSystem";
    private const string TaskName = "LumenSystem Calendar Server";
    private static Label status;
    private static Timer timer;
    private static bool busy;

    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Form form = new Form();
        form.Text = "Lumen System - Calendario operativo";
        form.StartPosition = FormStartPosition.CenterScreen;
        form.ClientSize = new Size(390, 250);
        form.FormBorderStyle = FormBorderStyle.FixedDialog;
        form.MaximizeBox = false;
        form.MinimizeBox = true;
        form.Font = new Font("Segoe UI", 10F);

        Label title = new Label();
        title.Text = "Calendario operativo Lumen System";
        title.Font = new Font("Segoe UI", 15F, FontStyle.Bold);
        title.Location = new Point(22, 18);
        title.Size = new Size(350, 32);
        form.Controls.Add(title);

        status = new Label();
        status.Text = "Controllo server…";
        status.Location = new Point(24, 62);
        status.Size = new Size(345, 28);
        form.Controls.Add(status);

        AddButton(form, "Avvia", 24, 105, delegate { Manage("Start"); });
        AddButton(form, "Ferma", 140, 105, delegate { Manage("Stop"); });
        AddButton(form, "Riavvia", 256, 105, delegate { Manage("Restart"); });
        AddButton(form, "Apri calendario", 24, 160, delegate
        {
            try { Process.Start("http://127.0.0.1:8787/"); }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Lumen System"); }
        });
        AddButton(form, "Installa avvio Windows", 190, 160, delegate { Install(); });

        timer = new Timer();
        timer.Interval = 4000;
        timer.Tick += delegate { RefreshStatus(); };
        timer.Start();
        form.Shown += delegate { RefreshStatus(); };
        Application.Run(form);
    }

    private static void AddButton(Form form, string text, int x, int y, Action action)
    {
        Button button = new Button();
        button.Text = text;
        button.Location = new Point(x, y);
        button.Size = new Size(text.StartsWith("Installa") ? 170 : (text.StartsWith("Apri") ? 150 : 110), 38);
        button.Click += delegate { action(); };
        form.Controls.Add(button);
    }

    private static string Script(string name)
    {
        return Path.Combine(Root, "server", "windows", name);
    }

    private static void Manage(string action)
    {
        string path = Script("manage-service.ps1");
        if (!File.Exists(path))
        {
            MessageBox.Show("Script di gestione mancante. Aggiorna i file in C:\\LumenSystem\\server\\windows.", "Lumen System");
            return;
        }
        RunElevated(path, "-Action " + action);
    }

    private static void Install()
    {
        string path = Script("install-service.ps1");
        if (!File.Exists(path))
        {
            MessageBox.Show("Script di installazione mancante. Aggiorna i file in C:\\LumenSystem\\server\\windows.", "Lumen System");
            return;
        }
        RunElevated(path, "");
    }

    private static void RunElevated(string script, string arguments)
    {
        try
        {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe");
            info.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\" " + arguments;
            info.Verb = "runas";
            info.UseShellExecute = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            Process.Start(info);
            status.Text = "Comando inviato; verifica in corso…";
            timer.Interval = 1500;
        }
        catch (Exception ex)
        {
            if (ex is System.ComponentModel.Win32Exception)
                status.Text = "Operazione annullata o non autorizzata.";
            else
                MessageBox.Show(ex.Message, "Lumen System");
        }
    }

    private static void RefreshStatus()
    {
        if (busy) return;
        busy = true;
        try
        {
            bool api = false;
            System.Net.HttpWebRequest request = (System.Net.HttpWebRequest)System.Net.WebRequest.Create("http://127.0.0.1:8787/health");
            request.Timeout = 1800;
            using (System.Net.HttpWebResponse response = (System.Net.HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                api = reader.ReadToEnd().IndexOf("\"ok\":true", StringComparison.OrdinalIgnoreCase) >= 0;
            status.Text = api ? "Server attivo - porta 8787" : "Server non raggiungibile";
            status.ForeColor = api ? Color.DarkGreen : Color.DarkRed;
        }
        catch
        {
            status.Text = "Server non raggiungibile";
            status.ForeColor = Color.DarkRed;
        }
        finally { busy = false; }
    }
}
