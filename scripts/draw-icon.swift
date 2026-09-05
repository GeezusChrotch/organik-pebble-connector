import AppKit
let size=512
let image=NSImage(size:NSSize(width:size,height:size))
image.lockFocus()
NSColor(calibratedRed:0.12,green:0.27,blue:0.20,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:14,y:14,width:484,height:484),xRadius:106,yRadius:106).fill()
NSColor(calibratedRed:0.91,green:0.92,blue:0.80,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:108,y:120,width:296,height:102),xRadius:51,yRadius:51).fill()
NSColor(calibratedRed:0.63,green:0.77,blue:0.60,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:140,y:244,width:232,height:88),xRadius:44,yRadius:44).fill()
NSColor(calibratedRed:0.82,green:0.87,blue:0.70,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:186,y:354,width:140,height:65),xRadius:32,yRadius:32).fill()
image.unlockFocus()
let representation=NSBitmapImageRep(data:image.tiffRepresentation!)!
try representation.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
