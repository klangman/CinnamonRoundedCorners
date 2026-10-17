# Cinnamon Rounded Corners

A Cinnamon extension that allows you to round the corners of windows with custom borders and shadows

**Status: Release Candidate.**

I will submit to Cinnamon Spices once I have done more testing and I think it's GA worthy. 

## Installation:

Add a soft link to the RoundedCorners@klangman directory to your Extension folder. From the directory where you cloned this repo type:

```
ln -s $PWD/RoundedCorners@klangman/ ~/.local/share/cinnamon/extensions/RoundedCorners@klangman
```

## Removing Theme's Rounded Corners:

The **Rounded Corners** extension can <u>not</u> square off corners that are already rounded by the systems Applications Theme. 

But you can override the theme's rounding using the files `~/.config/gtk-3.0/gtk.css` and `~/.config/gtk-4.0.gtk.css`. 

The CSS code below will remove the title bar rounding completely so that you can use the **Rounded Corners** extension to define whatever rounding you like, even a rounding radius that is less than the themes default radius. It also removes borders.

**<u>~/.config/gtk-3.0/gtk.css</u>**

```css
headerbar, .titlebar {
    border-radius: 0px;
    border-top-left-radius: 0px;
    border-top-right-radius: 0px;
    border: none;
    box-shadow: none;
}

decoration,
.csd,
.csd decoration {
    border-radius: 0px;
    border-top-left-radius: 0px;
    border-top-right-radius: 0px;
    box-shadow: none;
}
```

**<u>~/.config/gtk-4.0.gtk.css</u>**

```css
window {
    --window-radius: 0px;
    border-radius: 0px;
}
```



## Credits:

Developed By: Kevin Langman

The Rounded Corners effect code is borrowed from the Blur-My-Shell Gnome Extension.

The Shadow shader is 100% Claude AI generated

Claude was used to assist (speed up) development
