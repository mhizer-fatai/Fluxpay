// FluxPay brand assets generator — draws the mark + wordmark lockups with GDI+
// (no external dependencies) and writes PNGs for the submission/README.
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;

class Brand
{
    const string BRAND = "#D35A44";
    const string INK = "#17191A";

    static GraphicsPath Rounded(int x, int y, int w, int h, int r)
    {
        var p = new GraphicsPath();
        p.AddArc(x, y, r * 2, r * 2, 180, 90);
        p.AddArc(x + w - r * 2, y, r * 2, r * 2, 270, 90);
        p.AddArc(x + w - r * 2, y + h - r * 2, r * 2, r * 2, 0, 90);
        p.AddArc(x, y + h - r * 2, r * 2, r * 2, 90, 90);
        p.CloseFigure();
        return p;
    }

    static void DrawMark(Graphics g, float s, float ox, float oy, Color fg)
    {
        // s = scale (1.0 == 1024 grid), origin offset in px.
        using (var bg = new SolidBrush(ColorTranslator.FromHtml(BRAND)))
        using (var path = Rounded((int)ox, (int)oy, (int)(1024 * s), (int)(1024 * s), (int)(224 * s)))
            g.FillPath(bg, path);
        using (var f = new SolidBrush(fg))
        {
            g.FillRectangle(f, ox + 290 * s, oy + 280 * s, 112 * s, 464 * s); // stem
            g.FillRectangle(f, ox + 290 * s, oy + 280 * s, 370 * s, 112 * s); // top bar
            g.FillRectangle(f, ox + 290 * s, oy + 496 * s, 280 * s, 112 * s); // middle bar
            g.FillPolygon(f, new[] {                                                        // flow arrow
                new PointF(ox + 600 * s, oy + 470 * s),
                new PointF(ox + 600 * s, oy + 634 * s),
                new PointF(ox + 740 * s, oy + 552 * s),
            });
        }
    }

    static void Save(Bitmap bmp, string file)
    {
        bmp.Save(file, ImageFormat.Png);
        bmp.Dispose();
        Console.WriteLine("wrote " + file);
    }

    static void Main()
    {
        var dir = "brand";
        System.IO.Directory.CreateDirectory(dir);

        // 1) Square mark, transparent background (1024).
        using (var bmp = new Bitmap(1024, 1024))
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            DrawMark(g, 1f, 0, 0, Color.White);
            Save(bmp, dir + "/fluxpay-mark.png");
        }

        // 2) Horizontal lockups: mark + lowercase wordmark (dark text for light backgrounds,
        //    white text for dark backgrounds).
        string[] lockupNames = { "fluxpay-logo.png", "fluxpay-logo-white.png" };
        Color[] lockupInks = { ColorTranslator.FromHtml(INK), Color.White };
        for (int i = 0; i < lockupNames.Length; i++)
        {
            string name = lockupNames[i];
            Color ink = lockupInks[i];
            using (var bmp = new Bitmap(1600, 600))
            using (var g = Graphics.FromImage(bmp))
            using (var font = new Font("Segoe UI", 168, FontStyle.Bold, GraphicsUnit.Pixel))
            using (var brush = new SolidBrush(ink))
            using (var fmt = new StringFormat { LineAlignment = StringAlignment.Center, Alignment = StringAlignment.Near })
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                g.Clear(Color.Transparent);
                DrawMark(g, 0.39f, 80, 100, Color.White);
                g.DrawString("fluxpay", font, brush, new RectangleF(560, 0, 1000, 600), fmt);
                Save(bmp, dir + "/" + name);
            }
        }

        // 3) Square avatar with a light background (works where transparency is not).
        using (var bmp = new Bitmap(1024, 1024))
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(ColorTranslator.FromHtml("#F6F7F8"));
            DrawMark(g, 1f, 0, 0, Color.White);
            Save(bmp, dir + "/fluxpay-mark-light.png");
        }
    }
}
