
# Input
For reach parser there's nodes available with underlying buffers full of data. Whenever data is added, these buffers get updated.

# Graphs
By default when a user creates a parser, a line graph gets created for it. 

However to give the user more control, it is possible to create add new graphs. 

The user can specify this inside the GraphPanel. Graphs can be added and the style of which can be picked. Examples of this may be: standard line chart, pie chart, bar chart. At the top of the panel is a list of all nodes. Under this list it has an area for each graph. The user can drag and drop nodes from the list into each graph. That way the graph will use those nodes and display their data.

# Dashboard
The dashboard shows all graphs, and allows the user to scale each one. They can be resized and moved making their layout change dynamically.