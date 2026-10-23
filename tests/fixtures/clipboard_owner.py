import ctypes,ctypes.util,sys
from pathlib import Path
gtk=ctypes.CDLL(ctypes.util.find_library('gtk-3'))
gdk=ctypes.CDLL(ctypes.util.find_library('gdk-3'))
pixbuf=ctypes.CDLL(ctypes.util.find_library('gdk_pixbuf-2.0'))
gtk.gtk_init_check.argtypes=[ctypes.c_void_p,ctypes.c_void_p];gtk.gtk_init_check.restype=ctypes.c_int
assert gtk.gtk_init_check(None,None)
gdk.gdk_atom_intern_static_string.argtypes=[ctypes.c_char_p];gdk.gdk_atom_intern_static_string.restype=ctypes.c_void_p
gtk.gtk_clipboard_get.argtypes=[ctypes.c_void_p];gtk.gtk_clipboard_get.restype=ctypes.c_void_p
clipboard=gtk.gtk_clipboard_get(gdk.gdk_atom_intern_static_string(b'CLIPBOARD'))
if sys.argv[1]=='image':
 pixbuf.gdk_pixbuf_new_from_file.argtypes=[ctypes.c_char_p,ctypes.c_void_p];pixbuf.gdk_pixbuf_new_from_file.restype=ctypes.c_void_p
 image=pixbuf.gdk_pixbuf_new_from_file(sys.argv[2].encode(),None);assert image
 gtk.gtk_clipboard_set_image.argtypes=[ctypes.c_void_p,ctypes.c_void_p];gtk.gtk_clipboard_set_image(clipboard,image)
else:
 gtk.gtk_clipboard_set_text.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_int];gtk.gtk_clipboard_set_text(clipboard,sys.argv[2].encode(),-1)
print('ready',flush=True)
gtk.gtk_main()
