#!/usr/bin/python3

import os
import gi

from JsonSettingsWidgets import *
from gi.repository import Gtk, GdkPixbuf, GLib


# An About page Widget with an optional image and a centered label that supports markup
class About(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info

      UUID = "RoundedCorners@klangman"
      extensions_path  = GLib.get_user_data_dir() + "/cinnamon/extensions/"

      version = ""
      if settings.has_key("ext-version"):
         version = settings.get_value("ext-version") or ""

      self.box = Gtk.Box(spacing=10,orientation=Gtk.Orientation.VERTICAL,margin_start=20, margin_end=20, margin_top=20, margin_left=20, margin_right=20)
      self.label = Gtk.Label("", xalign=0.5, justify=Gtk.Justification.CENTER, expand=True)
      self.label.set_markup(info["description"].replace("ext-version", version))

      # The icon is optional, only show it if the file exists
      if "icon" in info:
         icon_path = extensions_path + UUID + info["icon"]
         if os.path.isfile(icon_path):
            pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(icon_path, width=192, height=192,  preserve_aspect_ratio=True)
            self.image = Gtk.Image.new_from_pixbuf(pixbuf)
            self.box.add(self.image)

      self.box.add(self.label)
      self.pack_start(self.box, True, True, 0)


# A note shown at the top of a settings page: an info icon and a wrapped label that supports markup
class Note(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info

      icon = Gtk.Image.new_from_icon_name(info.get("icon-name", "dialog-information-symbolic"), Gtk.IconSize.LARGE_TOOLBAR)
      icon.set_valign(Gtk.Align.CENTER)

      self.label = Gtk.Label("", xalign=0, hexpand=True)
      self.label.set_line_wrap(True)
      self.label.set_max_width_chars(60)
      self.label.set_markup(info["description"])

      self.pack_start(icon, False, False, 0)
      self.pack_start(self.label, True, True, 0)
